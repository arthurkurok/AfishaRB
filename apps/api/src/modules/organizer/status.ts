/**
 * Машина статусов сеанса (docs/06-data.md §7; замечания жюри BL-6, BL-3).
 *
 * Допустимые переходы (по диаграмме плана):
 *   scheduled  → sold_out | rescheduled | postponed | cancelled
 *   sold_out   → scheduled («билеты вернулись») | rescheduled | postponed | cancelled
 *   postponed  → rescheduled | cancelled
 *   unverified → scheduled («подтверждено») | cancelled
 *   rescheduled — исходный сеанс конечный; повторный перенос двигает уже созданный новый сеанс.
 *   cancelled, ended — конечные.
 * Неизменный статус — не ошибка, но без записи в журнал (идемпотентность: нет дублей уведомлений).
 * Статус, выставленный на сеансе скрытого дубля, применяется к совпадающему сеансу канонического события.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { REGION_ID } from "../geo/index.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Status = "scheduled" | "cancelled" | "rescheduled" | "postponed" | "sold_out";

export type StatusChange = {
  occurrenceId: string;
  status: Status;
  reason?: string | null;
  newStartsAt?: Date | null;
  actor: string;
  sourceId?: "organizer_cabinet" | "moderator";
  now?: Date;
};

export class StatusChangeError extends Error {
  constructor(
    message: string,
    readonly httpStatus: 400 | 409,
  ) {
    super(message);
  }
}

export const TRANSITIONS: Record<string, readonly Status[]> = {
  scheduled: ["sold_out", "rescheduled", "postponed", "cancelled"],
  sold_out: ["scheduled", "rescheduled", "postponed", "cancelled"],
  postponed: ["rescheduled", "cancelled"],
  unverified: ["scheduled", "cancelled"],
  rescheduled: [],
  cancelled: [],
  ended: [],
};

const STATUS_RU: Record<string, string> = {
  scheduled: "по плану",
  sold_out: "распродано",
  rescheduled: "перенесено",
  postponed: "отложено",
  cancelled: "отменено",
  unverified: "уточняется",
  ended: "прошло",
};

type Occ = {
  id: string;
  region_id: string;
  event_id: string;
  venue_id: string | null;
  municipality_id: string | null;
  starts_at: Date;
  ends_at: Date | null;
  status: string;
  availability: string;
  rescheduled_to: string | null;
  ticket_url: string | null;
  cluster_id: string | null;
};

const toDate = (v: unknown) => (v instanceof Date ? v : new Date(String(v)));

async function lockOcc(tx: Tx, id: string): Promise<Occ | null> {
  const r = (
    await tx.execute<Occ>(sql`
      SELECT o.id, o.region_id, o.event_id, o.venue_id, o.municipality_id, o.starts_at, o.ends_at, o.status, o.availability,
             o.rescheduled_to, o.ticket_url, e.cluster_id
      FROM occurrence o JOIN event e ON e.id = o.event_id WHERE o.id = ${id} FOR UPDATE OF o`)
  ).rows[0];
  if (!r) return null;
  return { ...r, starts_at: toDate(r.starts_at), ends_at: r.ends_at ? toDate(r.ends_at) : null };
}

async function log(
  tx: Tx,
  occ: Occ,
  kind: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  ch: StatusChange,
) {
  await tx.execute(sql`
    INSERT INTO change_log (region_id, entity_type, entity_id, event_id, kind, field, old_value, new_value, source_id, actor, reason)
    VALUES (${REGION_ID}, 'occurrence', ${occ.id}, ${occ.cluster_id ?? occ.event_id}, ${kind}, ${field},
            ${JSON.stringify(oldValue ?? null)}::jsonb, ${JSON.stringify(newValue ?? null)}::jsonb,
            ${ch.sourceId ?? "organizer_cabinet"}, ${ch.actor}, ${ch.reason ?? null})`);
}

/** Сеанс канонического события, совпадающий с сеансом скрытого дубля (та же площадка или ≤ 300 м, ±45 мин). */
async function canonicalTwin(tx: Tx, occ: Occ): Promise<string | null> {
  if (!occ.cluster_id) return null;
  const r = await tx.execute<{ id: string }>(sql`
    SELECT k.id FROM occurrence k
    LEFT JOIN venue vk ON vk.id = k.venue_id LEFT JOIN venue vd ON vd.id = ${occ.venue_id}
    WHERE k.event_id = ${occ.cluster_id}
      AND abs(extract(epoch FROM (k.starts_at - ${occ.starts_at}::timestamptz))) <= 45 * 60
      AND (k.venue_id = ${occ.venue_id} OR ST_DWithin(vk.geo, vd.geo, 300))
    ORDER BY abs(extract(epoch FROM (k.starts_at - ${occ.starts_at}::timestamptz))) LIMIT 1`);
  return r.rows[0]?.id ?? null;
}

async function applyOne(
  tx: Tx,
  occ: Occ,
  ch: StatusChange,
): Promise<{ status: string; rescheduled_to: string | null; changed: boolean }> {
  const now = ch.now ?? new Date();
  // Повторный перенос: двигаем уже созданный новый сеанс, исходный остаётся «перенесено»
  if (occ.status === "rescheduled" && ch.status === "rescheduled" && occ.rescheduled_to) {
    const target = await lockOcc(tx, occ.rescheduled_to);
    if (!target) throw new StatusChangeError("Новый сеанс переноса не найден", 409);
    return applyOne(tx, target, ch);
  }
  if (occ.status === ch.status && ch.status !== "rescheduled")
    return { status: occ.status, rescheduled_to: occ.rescheduled_to, changed: false };

  const allowed = TRANSITIONS[occ.status] ?? [];
  if (!allowed.includes(ch.status) && !(occ.status === "scheduled" && ch.status === "rescheduled")) {
    throw new StatusChangeError(
      `Переход «${STATUS_RU[occ.status] ?? occ.status}» → «${STATUS_RU[ch.status] ?? ch.status}» недопустим`,
      409,
    );
  }

  if (ch.status === "rescheduled") {
    if (!ch.newStartsAt) throw new StatusChangeError("Для переноса укажите new_starts_at", 400);
    if (ch.newStartsAt.getTime() <= now.getTime()) throw new StatusChangeError("Перенос в прошлое невозможен", 400);
    if (ch.newStartsAt.getTime() === occ.starts_at.getTime())
      throw new StatusChangeError("Новое время совпадает с текущим", 400);
    const duration = occ.ends_at ? occ.ends_at.getTime() - occ.starts_at.getTime() : null;
    const created = (
      await tx.execute<{ id: string }>(sql`
        INSERT INTO occurrence (region_id, event_id, venue_id, municipality_id, starts_at, ends_at, status, previous_starts_at,
                                ticket_url, last_verified_at, freshness, source_key)
        VALUES (${occ.region_id}, ${occ.event_id}, ${occ.venue_id}, ${occ.municipality_id}, ${ch.newStartsAt},
                ${duration ? new Date(ch.newStartsAt.getTime() + duration) : null}, 'scheduled', ${occ.starts_at},
                ${occ.ticket_url}, ${now}, 'fresh',
                ${`${ch.sourceId ?? "organizer_cabinet"}:${occ.id}:${ch.newStartsAt.toISOString()}`})
        RETURNING id`)
    ).rows[0]!;
    await tx.execute(sql`
      UPDATE occurrence SET status = 'rescheduled', rescheduled_to = ${created.id}, status_reason = ${ch.reason ?? null},
             availability = 'unknown', updated_at = now() WHERE id = ${occ.id}`);
    await log(tx, occ, "rescheduled", "starts_at", occ.starts_at, ch.newStartsAt, ch);
    return { status: "rescheduled", rescheduled_to: created.id, changed: true };
  }

  // Выход из «распродано» сбрасывает доступность билетов (иначе ложное «Билетов нет»)
  const availability =
    ch.status === "sold_out" ? "sold_out" : occ.availability === "sold_out" ? "unknown" : occ.availability;
  // «По плану» без причины: старая причина («исчез из источника») иначе висит на карточке подтверждённого сеанса;
  // причина решения остаётся в журнале изменений
  const statusReason = ch.status === "scheduled" ? null : (ch.reason ?? null);
  await tx.execute(sql`
    UPDATE occurrence SET status = ${ch.status}, status_reason = ${statusReason}, availability = ${availability},
           freshness = CASE WHEN ${ch.status} = 'scheduled' THEN 'fresh' ELSE freshness END,
           last_verified_at = ${now}, updated_at = now()
    WHERE id = ${occ.id}`);
  await log(tx, occ, "status", "status", occ.status, ch.status, ch);
  return { status: ch.status, rescheduled_to: null, changed: true };
}

export async function changeOccurrenceStatus(db: Db, ch: StatusChange) {
  return db.transaction(async (tx) => {
    const occ = await lockOcc(tx, ch.occurrenceId);
    if (!occ) return null;
    const res = await applyOne(tx, occ, ch);
    // Статус на сеансе скрытого дубля — переносим на совпадающий сеанс канонического события (BL-3)
    if (res.changed && occ.cluster_id) {
      const twinId = await canonicalTwin(tx, occ);
      const twin = twinId ? await lockOcc(tx, twinId) : null;
      if (twin) {
        try {
          await applyOne(tx, twin, ch);
        } catch (err) {
          if (!(err instanceof StatusChangeError)) throw err;
        }
      }
    }
    await tx.execute(sql`
      INSERT INTO audit_log (actor, action, entity_type, entity_id, details)
      VALUES (${ch.actor}, ${`occurrence.${ch.status}`}, 'occurrence', ${occ.id},
              ${JSON.stringify({ reason: ch.reason ?? null, newStartsAt: ch.newStartsAt ?? null, changed: res.changed })}::jsonb)`);
    return { status: res.status, rescheduled_to: res.rescheduled_to, changed: res.changed };
  });
}
