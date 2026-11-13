/**
 * Гибридный поиск (docs/04-architecture.md §7): жёсткие фильтры → кандидаты → объяснимый скоринг →
 * свёртка сеансов одного события. Один и тот же поиск используют сайт, бот, приложения, виджет и ИИ-гид.
 */
import type { OccurrenceCard, ReasonCode, SearchQuery, SearchResult } from "@afisha/contract";
import { type SQL, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import type { ImageInfo } from "../../db/schema.js";
import { addDays, REGION_TZ, startOfLocalDay, toRegionIso } from "../geo/index.js";
import { maxRatingForChild, resolveWindow, type When } from "./dates.js";

/**
 * Веса объяснимого ранжирования «Подходящие» (docs/04-architecture.md §7).
 * Единственный источник: из них строится и SQL-скоринг, и публичная страница правил (ст. 10.2-2 149-ФЗ).
 */
export const RANKING_WEIGHTS = {
  text: 2.0,
  time: 1.0,
  timeDecayDays: 3,
  quality: 0.6,
  distance: 0.8,
  distanceScaleM: 3000,
  unverified: -1.0,
  soldOut: -0.5,
  longRunning: -0.6,
} as const;

export type SearchRow = {
  occ_id: string;
  event_id: string;
  starts_at: Date;
  ends_at: Date | null;
  is_range: boolean;
  status: string;
  status_reason: string | null;
  previous_starts_at: Date | null;
  availability: string;
  occ_ticket_url: string | null;
  freshness: string;
  title: { ru?: string; ba?: string };
  summary: { ru?: string; ba?: string };
  category_codes: string[];
  tags: string[];
  age_rating: number | null;
  is_free: boolean;
  price_min: string | null;
  price_max: string | null;
  pushkin_card: boolean;
  images: ImageInfo[];
  ticket_url: string | null;
  quality_score: number | null;
  created_at: Date;
  org_name: string | null;
  venue_id: string | null;
  venue_name: { ru?: string } | null;
  venue_address: string | null;
  lat: number | null;
  lon: number | null;
  municipality_id: string | null;
  municipality_name: { ru?: string; ba?: string } | null;
  dist_m: number | null;
  text_rank: number;
  n_dates: number;
  total: number;
  score: number;
};

/** Массив как один параметр PostgreSQL (drizzle раскрывает JS-массивы в список параметров). */
export const textArray = (arr: readonly string[]) =>
  sql`${`{${arr.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`}::text[]`;

const parseNear = (near?: string): [number, number] | null => {
  if (!near) return null;
  const [lat, lon] = near.split(",").map(Number);
  return lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
};

export function normalizeQueryText(q: string): string {
  return q.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

export async function searchOccurrences(db: Db, query: SearchQuery, now: Date = new Date()): Promise<SearchResult> {
  const win = resolveWindow(
    { when: query.when as When | undefined, date_from: query.date_from, date_to: query.date_to },
    now,
  );
  const limit = query.limit ?? 20;
  const offset = query.cursor ? Number(Buffer.from(query.cursor, "base64url").toString()) || 0 : 0;
  const near = parseNear(query.near);
  const q = query.q ? normalizeQueryText(query.q) : null;
  const group = query.group !== false;
  const lang = query.lang ?? "ru";

  const where: SQL[] = [
    sql`e.moderation_status = 'published'`,
    // «афиша на дату» — сеансы, НАЧИНАЮЩИЕСЯ в окне: длящаяся выставка показывается через
    // «до конца месяца» (ends_before), а не подмешивается в конкретный день
    sql`o.starts_at >= ${win.startUtc}`,
    sql`o.starts_at < ${win.endUtc}`,
  ];
  if (!query.include_ended) where.push(sql`o.status NOT IN ('ended', 'cancelled', 'postponed', 'rescheduled')`);
  if (query.hide_sold_out) where.push(sql`o.status <> 'sold_out'`);
  if (query.municipality?.length) where.push(sql`o.municipality_id = ANY(${textArray(query.municipality)})`);
  if (near) {
    const radius = (query.radius_km ?? 10) * 1000;
    where.push(sql`ST_DWithin(v.geo, ST_SetSRID(ST_MakePoint(${near[1]}, ${near[0]}), 4326)::geography, ${radius})`);
  }
  if (query.categories?.length) where.push(sql`e.category_codes && ${textArray(query.categories)}`);
  if (query.tags?.length) where.push(sql`e.tags @> ${textArray(query.tags)}`);
  if (query.free) where.push(sql`e.is_free`);
  if (query.pushkin) where.push(sql`e.pushkin_card`);
  if (query.accessible) where.push(sql`'accessible' = ANY(e.tags)`);
  if (query.venue) where.push(sql`o.venue_id = ${query.venue}`);
  if (query.organization) where.push(sql`e.organization_id = ${query.organization}`);
  if (query.events?.length) where.push(sql`e.id = ANY(${`{${query.events.join(",")}}`}::uuid[])`);
  if (query.price_max !== undefined) {
    where.push(sql`(e.is_free OR coalesce(o.price_min, e.price_min) <= ${query.price_max})`);
  }
  if (query.ends_before && /^\d{4}-\d{2}-\d{2}$/.test(query.ends_before))
    where.push(sql`coalesce(o.ends_at, o.starts_at) < ${startOfLocalDay(addDays(query.ends_before, 1))}`);
  if (query.age !== undefined) where.push(sql`coalesce(e.age_rating, 18) <= ${maxRatingForChild(query.age)}`);
  if (query.age_rating_max !== undefined) where.push(sql`coalesce(e.age_rating, 18) <= ${query.age_rating_max}`);
  if (query.time_of_day?.length) {
    const parts: SQL[] = [];
    const hour = sql`extract(hour FROM o.starts_at AT TIME ZONE ${REGION_TZ})`;
    // границы как в интерфейсе: утро до 12, день 12–18, вечер после 18; без исключений для
    // «длящихся» сеансов — у выставки тоже есть время начала, «вечером» она не началась
    if (query.time_of_day.includes("morning")) parts.push(sql`${hour} < 12`);
    if (query.time_of_day.includes("day")) parts.push(sql`(${hour} >= 12 AND ${hour} < 18)`);
    if (query.time_of_day.includes("evening")) parts.push(sql`${hour} >= 18`);
    where.push(sql`(${sql.join(parts, sql` OR `)})`);
  }
  // «после 19:00», «не позже 20:00» — фильтр по времени начала сеанса в поясе региона
  if (query.time_from && /^\d{1,2}:\d{2}$/.test(query.time_from)) {
    const [h, m] = query.time_from.split(":").map(Number) as [number, number];
    where.push(
      sql`(extract(hour FROM o.starts_at AT TIME ZONE ${REGION_TZ}) * 60 + extract(minute FROM o.starts_at AT TIME ZONE ${REGION_TZ})) >= ${h * 60 + m}`,
    );
  }
  if (query.time_until && /^\d{1,2}:\d{2}$/.test(query.time_until)) {
    const [h, m] = query.time_until.split(":").map(Number) as [number, number];
    where.push(
      sql`(extract(hour FROM o.starts_at AT TIME ZONE ${REGION_TZ}) * 60 + extract(minute FROM o.starts_at AT TIME ZONE ${REGION_TZ})) <= ${h * 60 + m}`,
    );
  }
  // «не дольше двух часов»: сеанс с неизвестным окончанием не отбрасываем — длительность не подтверждена
  if (query.duration_max_min !== undefined) {
    where.push(
      sql`(o.ends_at IS NULL OR (extract(epoch FROM (o.ends_at - o.starts_at)) / 60) <= ${query.duration_max_min})`,
    );
  }
  if (q) {
    where.push(sql`(e.search_tsv @@ websearch_to_tsquery('russian', ${q})
      OR e.title_norm % ${q} OR e.title_norm ILIKE ${`%${q}%`})`);
  }

  const distExpr = near
    ? sql`ST_Distance(v.geo, ST_SetSRID(ST_MakePoint(${near[1]}, ${near[0]}), 4326)::geography)`
    : sql`NULL::float`;
  const textRank = q
    ? sql`(ts_rank_cd(e.search_tsv, websearch_to_tsquery('russian', ${q})) + similarity(e.title_norm, ${q}))`
    : sql`0::float`;
  // Объяснимый скоринг: веса в одном месте, компоненты видны в reasons
  // Веса — доверенные константы кода: подставляем литералами (параметры в CASE … ELSE 0 PostgreSQL типизирует как integer)
  const W = Object.fromEntries(
    Object.entries(RANKING_WEIGHTS).map(([k, v]) => [k, sql.raw(Number(v).toFixed(4))]),
  ) as Record<keyof typeof RANKING_WEIGHTS, ReturnType<typeof sql.raw>>;
  const score = sql`(
      ${W.text} * text_rank
    + ${W.time} / (1 + greatest(0, extract(epoch FROM (greatest(starts_at, ${win.startUtc}) - ${win.startUtc})) / 86400) / ${W.timeDecayDays})
    + ${W.quality} * coalesce(quality_score, 0)
    + CASE WHEN dist_m IS NULL THEN 0 ELSE ${W.distance} / (1 + dist_m / ${W.distanceScaleM}) END
    + CASE WHEN status = 'unverified' THEN ${W.unverified} WHEN status = 'sold_out' THEN ${W.soldOut} ELSE 0 END
    + CASE WHEN is_range THEN ${W.longRunning} ELSE 0 END
  )`;
  const order =
    query.sort === "date"
      ? sql`starts_at ASC`
      : query.sort === "price"
        ? sql`coalesce(price_min, 0) ASC, starts_at ASC`
        : query.sort === "distance" && near
          ? sql`dist_m ASC NULLS LAST`
          : query.sort === "popular"
            ? sql`quality_score DESC NULLS LAST, starts_at ASC`
            : query.sort === "ending"
              ? sql`coalesce(ends_at, starts_at) ASC`
              : sql`score DESC, starts_at ASC`;

  const rows = (
    await db.execute<SearchRow>(sql`
    WITH base AS (
      SELECT o.id AS occ_id, o.event_id, o.starts_at, o.ends_at, o.is_range, o.status, o.status_reason,
             o.previous_starts_at, o.availability, o.ticket_url AS occ_ticket_url, o.freshness,
             coalesce(o.price_min, e.price_min) AS price_min, coalesce(o.price_max, e.price_max) AS price_max,
             e.title, e.summary, e.category_codes, e.tags, e.age_rating, e.is_free, e.pushkin_card, e.images,
             e.ticket_url, e.quality_score, e.created_at,
             org.short_name AS org_name,
             v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
             ST_Y(v.geo::geometry) AS lat, ST_X(v.geo::geometry) AS lon,
             o.municipality_id, m.name AS municipality_name,
             ${distExpr} AS dist_m, ${textRank} AS text_rank
      FROM occurrence o
      JOIN event e ON e.id = o.event_id
      LEFT JOIN venue v ON v.id = o.venue_id
      LEFT JOIN municipality m ON m.id = o.municipality_id
      LEFT JOIN organization org ON org.id = e.organization_id
      WHERE ${sql.join(where, sql` AND `)}
    ),
    grouped AS (
      ${group ? sql`SELECT DISTINCT ON (event_id) *, count(*) OVER (PARTITION BY event_id) AS n_dates FROM base ORDER BY event_id, (status = 'unverified'), starts_at` : sql`SELECT *, 1 AS n_dates FROM base`}
    ),
    scored AS (SELECT *, ${score} AS score, count(*) OVER () AS total FROM grouped)
    SELECT * FROM scored ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`)
  ).rows;

  for (const r of rows) normalizeRow(r);
  const total = rows[0] ? Number(rows[0].total) : 0;
  const items = rows.map((r) => toCard(r, query, lang, now));
  return {
    items,
    total,
    next_cursor: offset + rows.length < total ? Buffer.from(String(offset + rows.length)).toString("base64url") : null,
    applied: { date_from: win.from, date_to: win.to, timezone: REGION_TZ },
  };
}

const toDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v));

/** Сырые запросы возвращают timestamptz строками — приводим к Date. */
export function normalizeRow(r: SearchRow): SearchRow {
  r.starts_at = toDate(r.starts_at)!;
  r.ends_at = toDate(r.ends_at);
  r.previous_starts_at = toDate(r.previous_starts_at);
  r.created_at = toDate(r.created_at)!;
  return r;
}

export function reasonsFor(r: SearchRow, query: SearchQuery, now: Date): ReasonCode[] {
  const out: ReasonCode[] = [];
  if (query.age !== undefined) out.push("age_fit");
  if (r.is_free) out.push("free");
  else if (query.price_max !== undefined) out.push("budget_fit");
  if (r.dist_m !== null && r.dist_m !== undefined && Number(r.dist_m) < 3000) out.push("near");
  if (query.when || query.date_from || query.time_of_day?.length) out.push("time_fit");
  if (query.categories?.length) out.push("category_match");
  if (r.pushkin_card && (query.pushkin || query.tags?.includes("pushkin"))) out.push("pushkin");
  if (query.accessible) out.push("accessible");
  if (query.q && Number(r.text_rank) > 0) out.push("text_match");
  if (r.tags.includes("on_bashkir")) out.push("on_bashkir");
  if (r.is_range && r.ends_at && r.ends_at.getTime() - now.getTime() < 3 * 86400_000) out.push("last_chance");
  if (now.getTime() - new Date(r.created_at).getTime() < 3 * 86400_000) out.push("new");
  return out;
}

export function toCard(r: SearchRow, query: SearchQuery, lang: "ru" | "ba", now: Date): OccurrenceCard {
  const title = (lang === "ba" && r.title.ba) || r.title.ru || "";
  const muniName = r.municipality_name
    ? (lang === "ba" && r.municipality_name.ba) || r.municipality_name.ru || null
    : null;
  return {
    id: r.occ_id,
    event: {
      id: r.event_id,
      title,
      summary: (lang === "ba" && r.summary.ba) || r.summary.ru || "",
      categories: r.category_codes as OccurrenceCard["event"]["categories"],
      tags: r.tags as OccurrenceCard["event"]["tags"],
      age_rating: r.age_rating ?? 18,
      pushkin_card: r.pushkin_card,
      price: { min: r.price_min, max: r.price_max, is_free: r.is_free, currency: "RUB" },
      image: r.images?.[0] ?? null,
      organization: r.org_name,
    },
    venue: r.venue_id
      ? {
          id: r.venue_id,
          name: r.venue_name?.ru ?? "",
          address: r.venue_address,
          geo: r.lat !== null && r.lon !== null ? [Number(r.lat), Number(r.lon)] : null,
          municipality_id: r.municipality_id,
          municipality: muniName,
        }
      : null,
    starts_at: toRegionIso(new Date(r.starts_at))!,
    ends_at: toRegionIso(r.ends_at ? new Date(r.ends_at) : null),
    is_range: r.is_range,
    status: r.status as OccurrenceCard["status"],
    status_reason: r.status_reason,
    previous_starts_at: toRegionIso(r.previous_starts_at ? new Date(r.previous_starts_at) : null),
    availability: r.availability as OccurrenceCard["availability"],
    ticket_url: r.occ_ticket_url ?? r.ticket_url,
    more_dates: Math.max(0, Number(r.n_dates) - 1),
    distance_km: r.dist_m === null || r.dist_m === undefined ? null : Math.round(Number(r.dist_m) / 100) / 10,
    reasons: reasonsFor(r, query, now),
    freshness: r.freshness as OccurrenceCard["freshness"],
  };
}
