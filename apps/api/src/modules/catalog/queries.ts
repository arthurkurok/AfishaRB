/** Чтение каталога: карточка события («паспорт»), справочники, статистика. */
import type { ChangeEntry, EventDetail, Municipality } from "@afisha/contract";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import type { ImageInfo } from "../../db/schema.js";
import { humanDate, humanTime, localParts, toRegionIso } from "../geo/index.js";
import { CATEGORIES } from "./taxonomy.js";

type Lang = "ru" | "ba";
const pick = (v: { ru?: string; ba?: string } | null | undefined, lang: Lang) =>
  v ? (lang === "ba" && v.ba) || v.ru || "" : "";
const toDate = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v)));

const STATUS_RU: Record<string, string> = {
  scheduled: "по плану",
  rescheduled: "перенесено",
  postponed: "перенесено, новая дата уточняется",
  cancelled: "отменено",
  sold_out: "билетов нет",
  unverified: "информация уточняется",
  ended: "прошло",
};

export function describeChange(c: {
  kind: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
}): string {
  const fmt = (v: unknown) => {
    const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : null;
    return d ? `${humanDate(localParts(d).date, "ru", false)} ${humanTime(d)}` : String(v ?? "—");
  };
  switch (c.kind) {
    case "created":
      return "Событие добавлено в афишу";
    case "rescheduled":
      return `Перенесено: ${fmt(c.old_value)} → ${fmt(c.new_value)}`;
    case "status":
      return `Статус: ${STATUS_RU[String(c.new_value)] ?? c.new_value}${c.reason ? ` (${c.reason})` : ""}`;
    case "cancelled":
      return `Отменено${c.reason ? `: ${c.reason}` : ""}`;
    case "merged":
      return "Объединено с дублем из другого источника";
    case "field": {
      const names: Record<string, string> = {
        price_min: "цена от",
        priceMin: "цена от",
        priceMax: "цена до",
        title: "название",
        ageRating: "возраст",
        ticketUrl: "ссылка на билеты",
        venue_id: "площадка",
      };
      return `Изменено поле «${names[c.field ?? ""] ?? c.field}»`;
    }
    default:
      return c.reason ?? c.kind;
  }
}

export async function getEventDetail(db: Db, id: string, lang: Lang = "ru"): Promise<EventDetail | null> {
  const ev = (
    await db.execute<Record<string, any>>(sql`
      SELECT e.*, org.short_name AS org_name, org.name AS org_full
      FROM event e LEFT JOIN organization org ON org.id = e.organization_id
      WHERE e.id = ${id} AND e.moderation_status IN ('published', 'hidden')`)
  ).rows[0];
  if (!ev) return null;
  // Скрытый дубль — отдаём каноническое событие
  if (ev.moderation_status === "hidden" && ev.cluster_id) return getEventDetail(db, ev.cluster_id, lang);

  const occ = (
    await db.execute<Record<string, any>>(sql`
      SELECT o.*, v.name AS venue_name, v.address AS venue_address, ST_Y(v.geo::geometry) AS lat, ST_X(v.geo::geometry) AS lon,
             m.name AS municipality_name
      FROM occurrence o LEFT JOIN venue v ON v.id = o.venue_id LEFT JOIN municipality m ON m.id = o.municipality_id
      WHERE o.event_id = ${id} AND (o.status <> 'ended' OR o.starts_at > now() - interval '30 days')
      ORDER BY (o.status = 'ended'), o.starts_at LIMIT 60`)
  ).rows;

  const prov = (
    await db.execute<{ source_id: string; title: string; url: string | null; observed_at: string }>(sql`
      SELECT p.source_id, s.title, s.url, max(p.observed_at) AS observed_at
      FROM field_provenance p JOIN source s ON s.id = p.source_id
      WHERE p.entity_type = 'event' AND p.entity_id = ${id}
      GROUP BY p.source_id, s.title, s.url`)
  ).rows;
  const lastVerified =
    occ
      .map((o) => toDate(o.last_verified_at))
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;

  const history = (
    await db.execute<{
      created_at: string;
      kind: string;
      field: string | null;
      old_value: unknown;
      new_value: unknown;
      reason: string | null;
      source_id: string | null;
    }>(sql`
      SELECT created_at, kind, field, old_value, new_value, reason, source_id FROM change_log
      WHERE event_id = ${id} ORDER BY created_at DESC LIMIT 30`)
  ).rows.map(
    (c): ChangeEntry => ({
      at: toRegionIso(toDate(c.created_at))!,
      kind: c.kind,
      field: c.field,
      old: c.old_value ?? null,
      new: c.new_value ?? null,
      text: describeChange(c),
      source: c.source_id,
    }),
  );

  const images = (ev.images ?? []) as ImageInfo[];
  const freshness = occ.find((o) => o.status !== "ended")?.freshness ?? "stale";
  return {
    id: ev.id,
    title: pick(ev.title, lang),
    summary: pick(ev.summary, lang),
    categories: ev.category_codes,
    tags: ev.tags,
    age_rating: ev.age_rating ?? 18,
    pushkin_card: ev.pushkin_card,
    price: { min: ev.price_min, max: ev.price_max, is_free: ev.is_free, currency: "RUB" },
    image: images[0] ?? null,
    organization: ev.org_name ?? pick(ev.org_full, lang) ?? null,
    description_html: pick(ev.description, lang),
    images,
    languages: ev.languages,
    is_permanent: ev.is_permanent,
    ticket_url: ev.ticket_url,
    accessibility: ev.accessibility ?? {},
    occurrences: occ.map((o) => ({
      id: o.id,
      venue: o.venue_id
        ? {
            id: o.venue_id,
            name: pick(o.venue_name, lang),
            address: o.venue_address,
            geo: o.lat !== null ? [Number(o.lat), Number(o.lon)] : null,
            municipality_id: o.municipality_id,
            municipality: o.municipality_name ? pick(o.municipality_name, lang) : null,
          }
        : null,
      starts_at: toRegionIso(toDate(o.starts_at))!,
      ends_at: toRegionIso(toDate(o.ends_at)),
      is_range: o.is_range,
      status: o.status,
      status_reason: o.status_reason,
      previous_starts_at: toRegionIso(toDate(o.previous_starts_at)),
      availability: o.availability,
      ticket_url: o.ticket_url ?? ev.ticket_url,
      more_dates: 0,
      distance_km: null,
      reasons: [],
      freshness: o.freshness,
    })),
    provenance: {
      trust_level: ev.trust_level,
      sources: prov.map((p) => ({
        id: p.source_id,
        title: p.title,
        url: p.source_id === "culture_ru" ? ev.source_url : p.url,
      })),
      last_verified_at: toRegionIso(lastVerified),
      freshness,
    },
    history,
    source_url: ev.source_url,
    quality_score: ev.quality_score,
  };
}

export async function listMunicipalities(db: Db, lang: Lang = "ru"): Promise<Municipality[]> {
  const rows = (
    await db.execute<Record<string, any>>(sql`
      SELECT m.id, m.kind, m.name, ST_Y(m.center::geometry) AS lat, ST_X(m.center::geometry) AS lon,
        (SELECT count(*) FROM occurrence o JOIN event e ON e.id = o.event_id
          WHERE o.municipality_id = m.id AND e.moderation_status = 'published'
            AND o.status IN ('scheduled','sold_out','unverified') AND coalesce(o.ends_at, o.starts_at) >= now()) AS upcoming
      FROM municipality m WHERE m.region_id = 'ba'
      ORDER BY (m.kind = 'district'), upcoming DESC, m.name->>'ru'`)
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: pick(r.name, lang),
    name_ru: r.name.ru,
    name_ba: r.name.ba ?? null,
    center: r.lat !== null ? [Number(r.lat), Number(r.lon)] : null,
    upcoming: Number(r.upcoming),
  }));
}

export async function listCategories(db: Db, lang: Lang = "ru") {
  const counts = new Map(
    (
      await db.execute<{ code: string; n: string }>(sql`
        SELECT unnest(e.category_codes) AS code, count(DISTINCT e.id) AS n
        FROM event e JOIN occurrence o ON o.event_id = e.id
        WHERE e.moderation_status = 'published' AND o.status IN ('scheduled','sold_out','unverified')
          AND coalesce(o.ends_at, o.starts_at) >= now()
        GROUP BY 1`)
    ).rows.map((r) => [r.code, Number(r.n)]),
  );
  return CATEGORIES.map((c) => ({
    code: c.code,
    title: lang === "ba" ? c.ba : c.ru,
    color: c.color,
    count: counts.get(c.code) ?? 0,
  }));
}

export async function catalogStats(db: Db) {
  const r = (
    await db.execute<Record<string, any>>(sql`
      WITH up AS (
        SELECT o.*, e.is_free, e.pushkin_card FROM occurrence o JOIN event e ON e.id = o.event_id
        WHERE e.moderation_status = 'published' AND o.status IN ('scheduled','sold_out','unverified')
          AND coalesce(o.ends_at, o.starts_at) >= now()
      )
      SELECT (SELECT count(DISTINCT event_id) FROM up) AS events,
             (SELECT count(*) FROM up) AS upcoming,
             (SELECT count(*) FROM venue) AS venues,
             (SELECT count(DISTINCT municipality_id) FROM up) AS munis,
             (SELECT avg(is_free::int) FROM up) AS free_share,
             (SELECT avg(pushkin_card::int) FROM up) AS pushkin_share,
             (SELECT max(finished_at) FROM source_run WHERE status IN ('ok','partial')) AS updated_at`)
  ).rows[0]!;
  return {
    events: Number(r.events),
    upcoming_occurrences: Number(r.upcoming),
    venues: Number(r.venues),
    municipalities_with_events: Number(r.munis),
    free_share: Math.round(Number(r.free_share ?? 0) * 1000) / 1000,
    pushkin_share: Math.round(Number(r.pushkin_share ?? 0) * 1000) / 1000,
    updated_at: toRegionIso(toDate(r.updated_at)),
  };
}

export async function getVenueRow(db: Db, id: string, lang: Lang = "ru") {
  const r = (
    await db.execute<Record<string, unknown>>(sql`
      SELECT v.id, v.name, v.address, ST_Y(v.geo::geometry) AS lat, ST_X(v.geo::geometry) AS lon, v.municipality_id,
             m.name AS municipality_name, coalesce(org.short_name, org.name->>'ru') AS org_name, v.accessibility
      FROM venue v LEFT JOIN municipality m ON m.id = v.municipality_id LEFT JOIN organization org ON org.id = v.organization_id
      WHERE v.id = ${id}`)
  ).rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    name: pick(r.name as { ru?: string }, lang),
    address: (r.address as string) ?? null,
    geo: r.lat !== null ? ([Number(r.lat), Number(r.lon)] as [number, number]) : null,
    municipality_id: (r.municipality_id as string) ?? null,
    municipality: r.municipality_name ? pick(r.municipality_name as { ru?: string; ba?: string }, lang) : null,
    organization: (r.org_name as string) ?? null,
    accessibility: (r.accessibility as Record<string, unknown>) ?? {},
  };
}
