/**
 * Слияние и разъединение дублей на уровне сеансов (docs/06-data.md §5–6, замечания жюри BL-2, BL-3, MJ-8).
 *
 * - Каноническое событие выбирается по уровню доверия источника (кабинет учреждения > PRO.Культура > …),
 *   затем по полноте карточки.
 * - Совпадающие сеансы (та же площадка или ≤ 300 м, ±45 мин) остаются у скрытого дубля; остальные переносятся
 *   в каноническое событие — расписание не теряется.
 * - Разъединение возвращает перенесённые сеансы и запоминает решение «никогда не сливать».
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export const TRUST_RANK: Record<string, number> = {
  official_plus: 4,
  official: 3,
  partner: 2,
  aggregated: 1,
  extracted: 0,
};

type EventRow = {
  id: string;
  region_id: string;
  trust_level: string;
  quality_score: number | null;
  created_at: string;
  cluster_id: string | null;
};

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

/** Корень кластера: если событие уже слито, работаем с его каноническим. */
async function root(db: Exec, id: string): Promise<EventRow | null> {
  let cur = (
    await db.execute<EventRow>(
      sql`SELECT id, region_id, trust_level, quality_score, created_at, cluster_id FROM event WHERE id = ${id}`,
    )
  ).rows[0];
  for (let i = 0; cur?.cluster_id && i < 5; i++) {
    cur = (
      await db.execute<EventRow>(
        sql`SELECT id, region_id, trust_level, quality_score, created_at, cluster_id FROM event WHERE id = ${cur.cluster_id}`,
      )
    ).rows[0];
  }
  return cur ?? null;
}

/** Кто из двух — каноническое событие: доверие источника → полнота → более раннее. */
export function chooseCanonical<T extends { trust_level: string; quality_score: number | null; created_at: string }>(
  a: T,
  b: T,
): [T, T] {
  const ta = TRUST_RANK[a.trust_level] ?? 0;
  const tb = TRUST_RANK[b.trust_level] ?? 0;
  if (ta !== tb) return ta > tb ? [a, b] : [b, a];
  const qa = a.quality_score ?? 0;
  const qb = b.quality_score ?? 0;
  if (qa !== qb) return qa > qb ? [a, b] : [b, a];
  return a.created_at <= b.created_at ? [a, b] : [b, a];
}

export async function decisionFor(db: Exec, a: string, b: string): Promise<string | null> {
  const [x, y] = pair(a, b);
  const r = await db.execute<{ decision: string }>(
    sql`SELECT decision FROM match_decision WHERE event_a = ${x} AND event_b = ${y}`,
  );
  return r.rows[0]?.decision ?? null;
}

/** Модератор решил «это разные события» — больше никогда не сливать (в том числе автоматически). */
export async function recordDistinct(db: Exec, a: string, b: string, actor: string): Promise<void> {
  const [x, y] = pair(a, b);
  await db.execute(sql`
    INSERT INTO match_decision (event_a, event_b, decision, actor) VALUES (${x}, ${y}, 'never_merge', ${actor})
    ON CONFLICT (event_a, event_b) DO UPDATE SET decision = 'never_merge', actor = EXCLUDED.actor, created_at = now()`);
}

/**
 * Слить два события. Возвращает id канонического и число перенесённых сеансов.
 * null — если пара запрещена решением модератора или это одно и то же событие.
 */
export async function mergeEvents(
  db: Db,
  a: string,
  b: string,
  opts: { actor: string; reason: string; score?: number; reasons?: string[] },
): Promise<{ keep: string; drop: string; moved: number; matched: number } | null> {
  return db.transaction(async (tx) => {
    const ra = await root(tx, a);
    const rb = await root(tx, b);
    if (!ra || !rb || ra.id === rb.id) return null;
    if ((await decisionFor(tx, ra.id, rb.id)) === "never_merge" || (await decisionFor(tx, a, b)) === "never_merge")
      return null;
    const [keep, drop] = chooseCanonical(ra, rb);

    // Сеансы дубля: совпадающие с каноническими остаются у скрытого дубля, остальные переносятся
    const moved = (
      await tx.execute<{ id: string }>(sql`
        UPDATE occurrence d SET event_id = ${keep.id}, updated_at = now()
        WHERE d.event_id = ${drop.id}
          AND NOT EXISTS (
            SELECT 1 FROM occurrence k
            LEFT JOIN venue vk ON vk.id = k.venue_id
            LEFT JOIN venue vd ON vd.id = d.venue_id
            WHERE k.event_id = ${keep.id}
              AND abs(extract(epoch FROM (k.starts_at - d.starts_at))) <= 45 * 60
              AND (k.venue_id = d.venue_id OR ST_DWithin(vk.geo, vd.geo, 300))
          )
        RETURNING d.id`)
    ).rows;
    const matched = Number(
      (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM occurrence WHERE event_id = ${drop.id}`))
        .rows[0]?.n ?? 0,
    );

    await tx.execute(
      sql`UPDATE event SET cluster_id = ${keep.id}, moderation_status = 'hidden', updated_at = now() WHERE id = ${drop.id}`,
    );
    // Ранее слитые в «дубль» теперь указывают на новый корень (кластер без цепочек)
    await tx.execute(sql`UPDATE event SET cluster_id = ${keep.id} WHERE cluster_id = ${drop.id}`);
    const [x, y] = pair(keep.id, drop.id);
    await tx.execute(sql`
      INSERT INTO match_decision (event_a, event_b, decision, actor) VALUES (${x}, ${y}, 'merge', ${opts.actor})
      ON CONFLICT (event_a, event_b) DO NOTHING`);
    await tx.execute(sql`
      INSERT INTO change_log (region_id, entity_type, entity_id, event_id, kind, new_value, source_id, actor, reason)
      VALUES (${keep.region_id}, 'event', ${drop.id}, ${keep.id}, 'merged',
              ${JSON.stringify({ into: keep.id, score: opts.score ?? null, reasons: opts.reasons ?? [], moved_occurrences: moved.map((m) => m.id) })}::jsonb,
              'dedup', ${opts.actor}, ${opts.reason})`);
    return { keep: keep.id, drop: drop.id, moved: moved.length, matched };
  });
}

/** Разъединить слитое событие: вернуть его сеансы и запомнить «никогда не сливать». */
export async function unmergeEvent(
  db: Db,
  dropId: string,
  actor: string,
): Promise<{ restored: number; from: string } | null> {
  return db.transaction(async (tx) => {
    const ev = (
      await tx.execute<{ cluster_id: string | null; region_id: string }>(
        sql`SELECT cluster_id, region_id FROM event WHERE id = ${dropId}`,
      )
    ).rows[0];
    if (!ev?.cluster_id) return null;
    const keepId = ev.cluster_id;
    // Сеансы дубля узнаём по ключам его записей источника (source_key = <источник>:<внешний id>:<сеанс>)
    const restored = (
      await tx.execute<{ id: string }>(sql`
        UPDATE occurrence o SET event_id = ${dropId}, updated_at = now()
        FROM source_record r
        WHERE r.mapped_event_id = ${dropId} AND o.event_id = ${keepId}
          AND o.source_key LIKE r.source_id || ':' || r.external_id || ':%'
        RETURNING o.id`)
    ).rows;
    await tx.execute(
      sql`UPDATE event SET cluster_id = NULL, moderation_status = 'published', updated_at = now() WHERE id = ${dropId}`,
    );
    await recordDistinct(tx, dropId, keepId, actor);
    await tx.execute(sql`
      INSERT INTO change_log (region_id, entity_type, entity_id, event_id, kind, new_value, source_id, actor, reason)
      VALUES (${ev.region_id}, 'event', ${dropId}, ${dropId}, 'unmerged',
              ${JSON.stringify({ from: keepId, restored_occurrences: restored.map((r) => r.id) })}::jsonb, 'dedup', ${actor}, 'Разъединено')`);
    return { restored: restored.length, from: keepId };
  });
}
