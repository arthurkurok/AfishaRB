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
  await closeStaleVanishedTasks(db);
  return res.rowCount ?? 0;
}

/**
 * Задачи «исчезнувший сеанс», которые больше не требуют решения, закрываются сами (docs/06-data.md §7):
 * сеанс уже начался или прошёл, удалён, или его статус сменился без модератора (источник снова показал
 * сеанс, учреждение отменило или перенесло). Резолюция — код и человекочитаемый текст в payload.
 */
export async function closeStaleVanishedTasks(db: Db): Promise<number> {
  const res = await db.execute(sql`
    WITH stale AS (
      SELECT t.id,
        CASE
          WHEN o.id IS NULL THEN 'not_found'
          WHEN o.starts_at <= now() OR o.status = 'ended' THEN 'expired'
          WHEN o.status IN ('scheduled', 'sold_out') THEN 'source_confirmed'
          ELSE 'status_changed'
        END AS resolution
      FROM moderation_task t LEFT JOIN occurrence o ON o.id = t.entity_id
      WHERE t.kind = 'vanished' AND t.state = 'open'
        AND (o.id IS NULL OR o.starts_at <= now() OR o.status <> 'unverified')
    )
    UPDATE moderation_task t SET state = 'done', resolution = stale.resolution, resolved_by = 'lifecycle',
      payload = t.payload || jsonb_build_object('resolution_text', CASE stale.resolution
        WHEN 'expired' THEN 'Сеанс уже начался или прошёл — подтверждать или отменять нечего'
        WHEN 'source_confirmed' THEN 'Источник снова показывает сеанс — решение не требуется'
        WHEN 'not_found' THEN 'Сеанса больше нет в каталоге — решение не требуется'
        ELSE 'Статус сеанса уже изменён учреждением или модератором' END),
      updated_at = now()
    FROM stale WHERE t.id = stale.id`);
  return res.rowCount ?? 0;
}
