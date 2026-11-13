/**
 * Уведомления подписчикам об изменениях событий из избранного (docs/03-functional-spec.md §3.5).
 * Источник — append-only журнал change_log; доставка через транспорты каналов (Telegram, позже push).
 * Очередь на Postgres: FOR UPDATE SKIP LOCKED, идемпотентность — уникальность (profile, change).
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { log } from "../../lib/log.js";
import { humanDate, humanTime, localParts } from "../geo/index.js";

export type OutgoingNotification = {
  profileId: string;
  channel: string;
  externalId: string;
  lang: string;
  eventId?: string;
  title: string;
  text: string;
  changeId?: number;
  /** Кнопка-ссылка в сообщении; у дайджеста — «Смотреть все» на поиск по фильтрам подписки. */
  url?: string;
  urlLabel?: string;
};
export type Transport = (n: OutgoingNotification) => Promise<boolean>;

const transports = new Map<string, Transport>();
export const registerTransport = (channel: string, t: Transport) => transports.set(channel, t);
/** Транспорт канала (null — канал не умеет получать сообщения, например веб-устройство). */
export const getTransport = (channel: string): Transport | undefined => transports.get(channel);

type Row = {
  change_id: number;
  kind: string;
  new_value: unknown;
  old_value: unknown;
  reason: string | null;
  event_id: string;
  title: { ru?: string };
  starts_at: string | null;
  venue: { ru?: string } | null;
  profile_id: string;
  channel: string;
  external_id: string;
  lang: string;
};

export function notificationText(
  r: Pick<Row, "kind" | "new_value" | "old_value" | "reason" | "title" | "starts_at" | "venue">,
): string | null {
  const title = r.title.ru ?? "Событие";
  const when = r.starts_at
    ? `${humanDate(localParts(new Date(r.starts_at)).date, "ru", false)} в ${humanTime(new Date(r.starts_at))}`
    : "";
  const where = r.venue?.ru ? `, ${r.venue.ru}` : "";
  const reason = r.reason ? `\nПричина: ${r.reason}` : "";
  if (r.kind === "rescheduled") {
    // Исходная дата — из журнала (old_value), а не из сеанса: при переносе источником строка уже сдвинута (BL-4)
    const od = r.old_value ? new Date(String(r.old_value)) : r.starts_at ? new Date(r.starts_at) : null;
    const nd = new Date(String(r.new_value));
    if (od && od.getTime() === nd.getTime()) return null;
    const oldWhen = od ? `${humanDate(localParts(od).date, "ru", false)} в ${humanTime(od)}` : when;
    return `🔁 Перенос: «${title}» (${oldWhen}${where}) перенесено на ${humanDate(localParts(nd).date, "ru", false)} в ${humanTime(nd)}.${reason}`;
  }
  if (r.kind === "status") {
    if (r.new_value === "cancelled")
      return `❌ Отмена: «${title}» ${when}${where} отменено.${reason}\nПо возврату билетов обращайтесь в кассу.`;
    if (r.new_value === "sold_out") return `🎟 Билеты на «${title}» (${when}) закончились.`;
    if (r.new_value === "postponed") return `⏸ «${title}» (${when}) перенесено, новая дата уточняется.${reason}`;
    if (r.new_value === "unverified")
      return `❓ По событию «${title}» (${when}) информация уточняется — источник перестал его показывать. Сообщим, как только будет ясность.`;
  }
  return null;
}

/** Одна итерация: забрать необработанные изменения, разослать подписчикам, отметить. */
export async function processPendingChanges(
  db: Db,
  limit = 100,
): Promise<{ changes: number; sent: number; failed: number }> {
  return db.transaction(async (tx) => {
    const changes = (
      await tx.execute<{ id: number }>(sql`
        SELECT id FROM change_log
        WHERE notified = false AND entity_type = 'occurrence' AND kind IN ('status', 'rescheduled')
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`)
    ).rows;
    if (changes.length === 0) return { changes: 0, sent: 0, failed: 0 };
    const ids = changes.map((c) => c.id);
    const rows = (
      await tx.execute<Row>(sql`
        SELECT c.id AS change_id, c.kind, c.new_value, c.old_value, c.reason, c.event_id,
               e.title, o.starts_at, v.name AS venue,
               p.id AS profile_id, p.channel, p.external_id, p.lang
        FROM change_log c
        JOIN occurrence o ON o.id = c.entity_id
        JOIN event e ON e.id = c.event_id
        LEFT JOIN venue v ON v.id = o.venue_id
        JOIN favorite f ON f.event_id = c.event_id
        JOIN profile p ON p.id = f.profile_id AND p.notify_changes
        WHERE c.id = ANY(${`{${ids.join(",")}}`}::bigint[])
          AND NOT EXISTS (SELECT 1 FROM notification n WHERE n.profile_id = p.id AND n.change_id = c.id)`)
    ).rows;
    let sent = 0;
    let failed = 0;
    for (const r of rows) {
      const text = notificationText(r);
      const transport = transports.get(r.channel);
      if (!text || !transport) continue;
      let ok = false;
      try {
        ok = await transport({
          profileId: r.profile_id,
          channel: r.channel,
          externalId: r.external_id,
          lang: r.lang,
          eventId: r.event_id,
          title: r.title.ru ?? "",
          text,
          changeId: r.change_id,
        });
      } catch (err) {
        log.warn({ err: String(err), profile: r.profile_id }, "notify.transport_failed");
      }
      await tx.execute(sql`
        INSERT INTO notification (profile_id, kind, event_id, change_id, payload, status, sent_at)
        VALUES (${r.profile_id}, ${r.kind}, ${r.event_id}, ${r.change_id}, ${JSON.stringify({ text })}::jsonb, ${ok ? "sent" : "failed"}, ${ok ? new Date() : null})
        ON CONFLICT (profile_id, change_id) DO NOTHING`);
      if (ok) sent++;
      else failed++;
    }
    await tx.execute(sql`UPDATE change_log SET notified = true WHERE id = ANY(${`{${ids.join(",")}}`}::bigint[])`);
    return { changes: ids.length, sent, failed };
  });
}
