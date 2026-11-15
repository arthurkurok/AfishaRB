/**
 * Очередь модерации министерства (docs/03-functional-spec.md §8, docs/06-data.md §7).
 * Задачи бывают на событие (дубли, замечания к данным) и на сеанс («исчезнувший сеанс»): для задач на сеанс
 * ответ содержит название события и данные сеанса — иначе модератор видит «Без названия».
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { toRegionIso } from "../geo/index.js";
import { changeOccurrenceStatus, StatusChangeError } from "./status.js";

type Row = Record<string, unknown> & {
  entity_type: string | null;
  entity_id: string | null;
  o_id: string | null;
  o_event_id: string | null;
  o_starts_at: Date | string | null;
  o_ends_at: Date | string | null;
  o_status: string | null;
  o_status_reason: string | null;
  o_venue_id: string | null;
  o_venue_name: string | null;
  o_venue_address: string | null;
  o_municipality_id: string | null;
  o_municipality: string | null;
  group_size: number | string | null;
};

const toDate = (v: Date | string | null) => (v === null ? null : v instanceof Date ? v : new Date(v));

/**
 * Порядок: по приоритету; у «исчезнувших сеансов» приоритет считается на момент запроса — чем ближе
 * сеанс, тем выше (100 − дней до начала, не ниже 40), при равенстве — ближайший сеанс раньше.
 * Задачи на уже начавшиеся сеансы в открытой очереди не показываются (их закрывает lifecycle).
 */
export async function listModerationTasks(db: Db, q: { kind?: string; state: string; limit: number }) {
  const rows = (
    await db.execute<Row>(sql`
      SELECT t.*,
             coalesce(e1.title->>'ru', eo.title->>'ru', t.payload->>'title') AS title_a,
             e2.title->>'ru' AS title_b,
             o.id AS o_id, o.event_id AS o_event_id, o.starts_at AS o_starts_at, o.ends_at AS o_ends_at,
             o.status AS o_status, o.status_reason AS o_status_reason,
             o.venue_id AS o_venue_id, v.name->>'ru' AS o_venue_name, v.address AS o_venue_address,
             o.municipality_id AS o_municipality_id, m.name->>'ru' AS o_municipality,
             CASE WHEN t.kind = 'vanished' AND o.event_id IS NOT NULL THEN
               (SELECT count(*) FROM moderation_task t2 JOIN occurrence o2 ON o2.id = t2.entity_id
                WHERE t2.kind = 'vanished' AND t2.state = t.state AND o2.event_id = o.event_id
                  AND (t.state <> 'open' OR o2.starts_at > now()))
             END AS group_size
      FROM moderation_task t
      LEFT JOIN event e1 ON e1.id = t.entity_id
      LEFT JOIN event e2 ON e2.id = t.related_id
      LEFT JOIN occurrence o ON t.entity_type = 'occurrence' AND o.id = t.entity_id
      LEFT JOIN event eo ON eo.id = o.event_id
      LEFT JOIN venue v ON v.id = o.venue_id
      LEFT JOIN municipality m ON m.id = o.municipality_id
      WHERE t.state = ${q.state} ${q.kind ? sql`AND t.kind = ${q.kind}` : sql``}
        ${q.state === "open" ? sql`AND NOT (t.kind = 'vanished' AND o.starts_at IS NOT NULL AND o.starts_at <= now())` : sql``}
      ORDER BY
        CASE WHEN t.kind = 'vanished' AND o.starts_at IS NOT NULL
          THEN greatest(40, 100 - floor(greatest(extract(epoch FROM (o.starts_at - now())), 0) / 86400))::int
          ELSE t.priority END DESC,
        o.starts_at NULLS LAST, t.created_at
      LIMIT ${q.limit}`)
  ).rows;
  return rows.map((r) => {
    const {
      o_id,
      o_event_id,
      o_starts_at,
      o_ends_at,
      o_status,
      o_status_reason,
      o_venue_id,
      o_venue_name,
      o_venue_address,
      o_municipality_id,
      o_municipality,
      group_size,
      ...task
    } = r;
    return {
      ...task,
      // id события задачи: для дублей и замечаний — сама сущность, для сеанса — его событие
      event_id: r.entity_type === "occurrence" ? o_event_id : r.entity_id,
      group_size: group_size === null ? 1 : Number(group_size),
      occurrence: o_id
        ? {
            id: o_id,
            event_id: o_event_id,
            starts_at: toRegionIso(toDate(o_starts_at)),
            ends_at: toRegionIso(toDate(o_ends_at)),
            status: o_status,
            status_reason: o_status_reason,
            venue: o_venue_id ? { id: o_venue_id, name: o_venue_name, address: o_venue_address } : null,
            municipality_id: o_municipality_id,
            municipality: o_municipality,
          }
        : null,
    };
  });
}

const REASON = { confirm: "Модератор подтвердил сеанс", cancel: "Модератор подтвердил отмену" } as const;

async function closeTask(db: Db, id: string, resolution: string, actor: string, text?: string) {
  const res = await db.execute(sql`
    UPDATE moderation_task SET state = 'done', resolution = ${resolution}, resolved_by = ${actor},
           payload = ${text ? sql`payload || ${JSON.stringify({ resolution_text: text })}::jsonb` : sql`payload`},
           updated_at = now()
    WHERE id = ${id} AND state = 'open'`);
  return (res.rowCount ?? 0) > 0;
}

/**
 * «Исчезнувший сеанс»: подтвердить (снова по плану) или отменить — через машину статусов
 * (журнал, аудит, уведомления подписчикам об отмене, перенос на сеанс канонического события).
 * scope=event — то же решение для всех открытых задач этого события.
 */
export async function resolveVanished(
  db: Db,
  taskId: string,
  action: "confirm" | "cancel",
  scope: "task" | "event",
  actor: string,
): Promise<{ resolved: number } | { error: string }> {
  const targets = (
    await db.execute<{ id: string; occurrence_id: string | null; starts_at: Date | string | null }>(sql`
      SELECT t.id, o.id AS occurrence_id, o.starts_at
      FROM moderation_task t LEFT JOIN occurrence o ON o.id = t.entity_id
      WHERE t.kind = 'vanished' AND t.state = 'open' AND (t.id = ${taskId} OR (${scope === "event"} AND o.event_id = (
        SELECT o1.event_id FROM moderation_task t1 JOIN occurrence o1 ON o1.id = t1.entity_id WHERE t1.id = ${taskId})))
      ORDER BY (t.id = ${taskId}) DESC, o.starts_at`)
  ).rows;
  let resolved = 0;
  for (const t of targets) {
    const main = t.id === taskId;
    if (!t.occurrence_id) {
      await closeTask(db, t.id, "not_found", actor, "Сеанса больше нет в каталоге — решение не требуется");
      if (main && scope === "task") return { error: "Сеанс не найден — задача закрыта" };
      continue;
    }
    if (toDate(t.starts_at)!.getTime() <= Date.now()) {
      await closeTask(db, t.id, "expired", actor, "Сеанс уже начался или прошёл — подтверждать или отменять нечего");
      if (main && scope === "task") return { error: "Сеанс уже начался — задача закрыта без решения" };
      continue;
    }
    try {
      await changeOccurrenceStatus(db, {
        occurrenceId: t.occurrence_id,
        status: action === "confirm" ? "scheduled" : "cancelled",
        reason: REASON[action],
        actor,
        sourceId: "moderator",
      });
    } catch (err) {
      if (!(err instanceof StatusChangeError)) throw err;
      // статус уже сменили (учреждение отменило, перенесло) — решение модератора неприменимо
      if (main && scope === "task") return { error: err.message };
      continue;
    }
    if (await closeTask(db, t.id, action, actor)) resolved++;
  }
  return { resolved };
}
