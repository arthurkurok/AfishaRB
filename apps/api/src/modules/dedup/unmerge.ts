/** Разъединение ошибочно слитых событий (docs/06-data.md §5.3): статус восстанавливается, решение пишется в журнал. */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { unmergeEvent } from "./merge.js";
import { decide, scorePair } from "./scoring.js";

/** Пересчитать все автоматические слияния по текущим правилам и разъединить те, что больше не проходят порог. */
export async function revalidateMerges(db: Db): Promise<{ checked: number; unmerged: string[] }> {
  const rows = (
    await db.execute<{
      drop_id: string;
      keep_id: string;
      a: string;
      b: string;
      age_a: number | null;
      age_b: number | null;
    }>(sql`
      SELECT d.id AS drop_id, k.id AS keep_id, d.title->>'ru' AS a, k.title->>'ru' AS b, d.age_rating AS age_a, k.age_rating AS age_b
      FROM event d JOIN event k ON k.id = d.cluster_id
      WHERE d.moderation_status = 'hidden'
        AND EXISTS (SELECT 1 FROM change_log c WHERE c.entity_id = d.id AND c.kind = 'merged' AND c.actor = 'dedup')`)
  ).rows;
  const unmerged: string[] = [];
  for (const r of rows) {
    const sc = scorePair({
      titleA: r.a,
      titleB: r.b,
      minutesApart: 0,
      sameVenue: true,
      distanceM: 0,
      sameOrg: true,
      ageA: r.age_a,
      ageB: r.age_b,
      priceA: null,
      priceB: null,
    });
    if (decide(sc.score) === "merge") continue;
    await unmergeEvent(db, r.drop_id, "dedup:revalidate");
    unmerged.push(`${r.a} ≠ ${r.b}`);
  }
  return { checked: rows.length, unmerged };
}
