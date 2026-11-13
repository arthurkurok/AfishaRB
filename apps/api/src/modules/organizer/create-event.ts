/**
 * Событие из кабинета учреждения: уровень доверия official_plus, источник organizer_cabinet.
 * Проходит тот же конвейер, что и данные источников: provenance, журнал изменений, поиск.
 */
import { randomUUID } from "node:crypto";
import type { CabinetEventCreate } from "@afisha/contract";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { CatalogWriter, cleanUrl, ensureReference } from "../ingestion/index.js";

/** Простой текст без HTML: из кабинета приходят названия и описания, разметке там не место. */
const plain = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type CreateResult = { event_id: string } | { error: string; status: 400 | 403 | 404 };

export async function createCabinetEvent(db: Db, input: CabinetEventCreate, actor: string): Promise<CreateResult> {
  const venue = (
    await db.execute<{
      id: string;
      name: string;
      address: string | null;
      lat: number | null;
      lon: number | null;
      municipality_id: string | null;
      muni: string | null;
      ext: string | null;
    }>(sql`
      SELECT v.id, v.name->>'ru' AS name, v.address, ST_Y(v.geo::geometry) AS lat, ST_X(v.geo::geometry) AS lon, v.municipality_id,
             m.name->>'ru' AS muni, coalesce(v.external_ids->>'eipsk_place_id', v.external_ids->>'culture_place_id') AS ext
      FROM venue v LEFT JOIN municipality m ON m.id = v.municipality_id WHERE v.id = ${input.venue_id}`)
  ).rows[0];
  const org = (
    await db.execute<{ id: string; name: string }>(
      sql`SELECT id, coalesce(short_name, name->>'ru') AS name FROM organization WHERE id = ${input.organization_id}`,
    )
  ).rows[0];
  if (!venue || !org) return { error: "Учреждение или площадка не найдены", status: 404 };
  // Площадка должна принадлежать учреждению или уже использоваться им (изоляция учреждений, MJ-18)
  const owns =
    (
      await db.execute(sql`
      SELECT 1 FROM venue v WHERE v.id = ${input.venue_id} AND v.organization_id = ${org.id}
      UNION SELECT 1 FROM occurrence o JOIN event e ON e.id = o.event_id
      WHERE o.venue_id = ${input.venue_id} AND e.organization_id = ${org.id} LIMIT 1`)
    ).rows.length > 0;
  if (!owns) return { error: "Площадка не принадлежит учреждению", status: 403 };
  const ticketUrl = input.ticket_url ? cleanUrl(input.ticket_url) : null;
  if (input.ticket_url && !ticketUrl)
    return { error: "Ссылка на билеты должна начинаться с http:// или https://", status: 400 };
  const title = plain(input.title);
  const summary = plain(input.summary ?? "");
  if (title.length < 3) return { error: "Название слишком короткое", status: 400 };
  const externalId = randomUUID();
  const start = new Date(input.starts_at);
  await ensureReference(db);
  const writer = new CatalogWriter(db, "organizer_cabinet", null);
  await writer.warm();
  const tags = [...(input.is_free ? ["free" as const] : []), ...(input.pushkin_card ? ["pushkin" as const] : [])];
  const eventId = await writer.upsert(
    {
      sourceId: "organizer_cabinet",
      externalId,
      title,
      summary,
      descriptionHtml: summary ? `<p>${summary.replace(/[<>&]/g, "")}</p>` : "",
      categories: input.categories,
      tags,
      sourceGenres: [],
      ageRating: input.age_rating,
      priceMin: input.price_min === undefined ? (input.is_free ? "0.00" : null) : input.price_min.toFixed(2),
      priceMax: input.price_max === undefined ? (input.is_free ? "0.00" : null) : input.price_max.toFixed(2),
      isFree: input.is_free,
      pushkinCard: input.pushkin_card,
      accessible: false,
      isPermanent: false,
      ticketUrl: ticketUrl,
      images: [],
      organization: null, // учреждение уже есть в каталоге — привязываем ниже, без создания дубля
      venues: [
        {
          externalId: venue.ext ?? venue.id,
          name: venue.name,
          address: venue.address,
          lat: venue.lat,
          lon: venue.lon,
          municipalityId: venue.municipality_id,
          municipalityTitle: venue.muni,
          cultureLocaleId: null,
          externalIds: {},
        },
      ],
      sessions: [
        {
          externalId: "s1",
          venueExternalId: venue.ext ?? venue.id,
          startsAt: start,
          endsAt: input.ends_at ? new Date(input.ends_at) : null,
          isRange: false,
          ticketUrl: ticketUrl,
        },
      ],
      sourceUrl: null,
      sourceUpdatedAt: new Date(),
      languages: ["ru"],
    },
    { cabinet: true, actor, input },
  );
  await writer.flushLogs();
  // Учреждение — официальный источник: привязываем к существующему учреждению и обновляем поисковые поля только этого события
  await db.execute(sql`UPDATE event SET organization_id = ${org.id}, trust_level = 'official_plus',
      title_norm = lower(immutable_unaccent(replace(coalesce(title->>'ru',''), 'ё', 'е'))),
      search_tsv = setweight(to_tsvector('russian', coalesce(title->>'ru','')), 'A') || setweight(to_tsvector('russian', coalesce(summary->>'ru','')), 'B')
    WHERE id = ${eventId}`);
  await db.execute(
    sql`UPDATE occurrence SET venue_id = ${venue.id}, municipality_id = ${venue.municipality_id} WHERE event_id = ${eventId}`,
  );
  return { event_id: eventId };
}
