/** Поиск и обработка дублей в каталоге: автослияние только при высокой уверенности, серая зона — модератору. */
import { inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { event, moderationTask } from "../../db/schema.js";
import { log } from "../../lib/log.js";
import { mergeEvents } from "./merge.js";
import { decide, scorePair } from "./scoring.js";

export type DedupStats = { candidates: number; merged: number; review: number; distinct: number; examples: string[] };

type Candidate = { a: string; b: string; minutes_apart: number; same_venue: boolean; distance_m: number | null };

export async function runDedup(db: Db): Promise<DedupStats> {
  const stats: DedupStats = { candidates: 0, merged: 0, review: 0, distinct: 0, examples: [] };
  const rows = (
    await db.execute<Candidate>(sql`
      SELECT DISTINCT ON (LEAST(o1.event_id, o2.event_id), GREATEST(o1.event_id, o2.event_id))
        o1.event_id AS a, o2.event_id AS b,
        abs(extract(epoch FROM (o1.starts_at - o2.starts_at))) / 60 AS minutes_apart,
        (o1.venue_id = o2.venue_id) AS same_venue,
        ST_Distance(v1.geo, v2.geo) AS distance_m
      FROM occurrence o1
      JOIN occurrence o2 ON o1.event_id < o2.event_id
        AND o2.starts_at BETWEEN o1.starts_at - interval '45 minutes' AND o1.starts_at + interval '45 minutes'
        AND o1.municipality_id IS NOT DISTINCT FROM o2.municipality_id
      JOIN event e1 ON e1.id = o1.event_id AND e1.moderation_status = 'published' AND e1.cluster_id IS NULL
      JOIN event e2 ON e2.id = o2.event_id AND e2.moderation_status = 'published' AND e2.cluster_id IS NULL
      LEFT JOIN venue v1 ON v1.id = o1.venue_id
      LEFT JOIN venue v2 ON v2.id = o2.venue_id
      WHERE o1.is_range = false AND o2.is_range = false
        AND o1.status <> 'ended' AND o2.status <> 'ended'
        AND (o1.venue_id = o2.venue_id OR ST_DWithin(v1.geo, v2.geo, 300))
      ORDER BY LEAST(o1.event_id, o2.event_id), GREATEST(o1.event_id, o2.event_id), minutes_apart`)
  ).rows;
  stats.candidates = rows.length;
  if (rows.length === 0) return stats;
  const ids = [...new Set(rows.flatMap((r) => [r.a, r.b]))];
  const events = new Map((await db.select().from(event).where(inArray(event.id, ids))).map((e) => [e.id, e]));
  const reviewed = new Set(
    (
      await db.execute<{ k: string }>(
        sql`SELECT entity_id::text || ':' || related_id::text AS k FROM moderation_task WHERE kind = 'dedup_review'`,
      )
    ).rows.map((r) => r.k),
  );
  // Решения модераторов учитываются ДО скоринга: «разные» больше никогда не сливаются (docs/06-data.md §5.3)
  const decisions = new Set(
    (
      await db.execute<{ k: string }>(
        // ':' и 'never_merge' обязательно в кавычках: голое ':' драйвер трактует как параметр
        sql`SELECT event_a::text || ':' || event_b::text AS k FROM match_decision WHERE decision = 'never_merge'`,
      )
    ).rows.map((r) => r.k),
  );
  const merged = new Set<string>();
  for (const r of rows) {
    const a = events.get(r.a);
    const b = events.get(r.b);
    if (!a || !b || merged.has(a.id) || merged.has(b.id)) continue;
    const [x, y] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
    if (decisions.has(`${x}:${y}`)) {
      stats.distinct++;
      continue;
    }
    const sc = scorePair({
      titleA: a.title.ru ?? "",
      titleB: b.title.ru ?? "",
      minutesApart: Number(r.minutes_apart),
      sameVenue: Boolean(r.same_venue),
      distanceM: r.distance_m === null ? null : Number(r.distance_m),
      sameOrg: a.organizationId !== null && a.organizationId === b.organizationId,
      ageA: a.ageRating,
      ageB: b.ageRating,
      priceA: a.priceMin === null ? null : Number(a.priceMin),
      priceB: b.priceMin === null ? null : Number(b.priceMin),
    });
    const decision = decide(sc.score);
    if (decision === "merge") {
      // Слияние на уровне сеансов, каноническое — по доверию источника (merge.ts)
      const res = await mergeEvents(db, a.id, b.id, {
        actor: "dedup",
        reason: "Автоматическое объединение дублей",
        score: sc.score,
        reasons: sc.reasons,
      });
      if (!res) continue;
      merged.add(res.drop);
      stats.merged++;
      if (stats.examples.length < 5) stats.examples.push(`${a.title.ru} ≈ ${b.title.ru} (${sc.score})`);
    } else if (decision === "review") {
      if (!reviewed.has(`${a.id}:${b.id}`) && !reviewed.has(`${b.id}:${a.id}`)) {
        await db.insert(moderationTask).values({
          regionId: a.regionId,
          kind: "dedup_review",
          entityType: "event",
          entityId: a.id,
          relatedId: b.id,
          priority: 60,
          payload: { score: sc.score, reasons: sc.reasons, titles: [a.title.ru, b.title.ru] },
        });
      }
      stats.review++;
    } else {
      stats.distinct++;
    }
  }
  log.info({ ...stats, examples: undefined }, "dedup.done");
  return stats;
}
