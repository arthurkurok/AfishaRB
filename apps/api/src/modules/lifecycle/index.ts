/**
 * Жизненный цикл сеансов и производные поля каталога (docs/06-data.md §7, §9):
 * завершённые сеансы, свежесть, поисковые поля, центры муниципалитетов, индекс полноты.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";

export async function refreshDerived(db: Db): Promise<void> {
  await db.execute(sql`
    UPDATE event SET
      title_norm = lower(immutable_unaccent(replace(coalesce(title->>'ru',''), 'ё', 'е'))),
      search_tsv =
        setweight(to_tsvector('russian', coalesce(title->>'ru','')), 'A') ||
        setweight(to_tsvector('simple', coalesce(title->>'ba','')), 'A') ||
        setweight(to_tsvector('russian', coalesce(summary->>'ru','')), 'B') ||
        setweight(to_tsvector('russian', array_to_string(source_genres, ' ')), 'C') ||
        setweight(to_tsvector('simple', array_to_string(tags, ' ') || ' ' || array_to_string(category_codes, ' ')), 'C')`);
  await db.execute(sql`
    UPDATE municipality m SET center = sub.c FROM (
      SELECT municipality_id, ST_Centroid(ST_Collect(geo::geometry))::geography AS c
      FROM venue WHERE geo IS NOT NULL AND municipality_id IS NOT NULL GROUP BY municipality_id
    ) sub WHERE sub.municipality_id = m.id`);
  await markEnded(db);
  await db.execute(sql`
    UPDATE occurrence SET freshness = CASE
      WHEN last_verified_at > now() - interval '24 hours' THEN 'fresh'
      WHEN last_verified_at > now() - interval '72 hours' THEN 'aging'
      ELSE 'stale' END
    WHERE freshness <> 'vanished'`);
  await db.execute(sql`
    UPDATE event e SET quality_score = (
      (CASE WHEN age_rating IS NOT NULL THEN 15 ELSE 0 END) +
      (CASE WHEN jsonb_array_length(images) > 0 THEN 15 ELSE 0 END) +
      (CASE WHEN length(coalesce(description->>'ru','')) >= 300 THEN 10 ELSE 0 END) +
      (CASE WHEN price_min IS NOT NULL OR is_free THEN 15 ELSE 0 END) +
      (CASE WHEN ticket_url IS NOT NULL OR is_free THEN 10 ELSE 0 END) +
      (CASE WHEN accessibility <> '{}'::jsonb THEN 10 ELSE 0 END) +
      (CASE WHEN EXISTS (SELECT 1 FROM occurrence o JOIN venue v ON v.id = o.venue_id
                         WHERE o.event_id = e.id AND v.geo IS NOT NULL) THEN 10 ELSE 0 END) +
      (CASE WHEN title ? 'ba' THEN 10 ELSE 0 END) +
      (CASE WHEN duration_min IS NOT NULL THEN 5 ELSE 0 END)
    ) / 100.0`);
}

/** Сеансы, время которых прошло, получают статус ended (видны по прямой ссылке, но не в поиске). */
export async function markEnded(db: Db): Promise<number> {
  const res = await db.execute(sql`
    UPDATE occurrence SET status = 'ended'
    WHERE status IN ('scheduled','sold_out','unverified')
      AND coalesce(ends_at, starts_at + interval '3 hours') < now()`);
  return res.rowCount ?? 0;
}
