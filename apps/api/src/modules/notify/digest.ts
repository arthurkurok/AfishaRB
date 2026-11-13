/**
 * Дайджест по подпискам на сохранённые поиски (docs/03-functional-spec.md §3.5, ТЗ: раздел 3).
 * Воркер вызывает раз в час; на одну подписку — не чаще одного сообщения в сутки (saved_search.last_notified_at
 * — идемпотентность повторных прогонов). Новыми считаются сеансы, созданные с момента прошлой рассылки
 * (updated_at не годится: его ежечасно трогает lifecycle-refresh-derived). Максимум 5 событий, компактный
 * список «дата · название · город» и кнопка «Смотреть все» — на поиск с теми же фильтрами.
 * Тихие часы 22:00–09:00 по TZ региона и «пустой» дайджест — без сообщения (никакой навязчивости).
 */

import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { config } from "../../lib/config.js";
import { log } from "../../lib/log.js";
import { CATEGORIES } from "../catalog/index.js";
import { humanDate, localParts } from "../geo/index.js";
import { resolveWindow, textArray, type When } from "../search/index.js";
import { getTransport, type OutgoingNotification } from "./service.js";

/** Название подписки: «Уфа · Театр, Музыка», «Вся республика · Театр», «Уфа». */
export function subscriptionTitle(municipality: string | null, categories: string[]): string {
  const cats = categories.map((c) => CATEGORIES.find((x) => x.code === c)?.ru ?? c).join(", ");
  const place = municipality ?? "Вся республика";
  return cats ? `${place} · ${cats}` : place;
}

/** Событие дайджеста: всё, что нужно для строки «дата · название · город». */
export type DigestEvent = { starts_at: string | Date; title: string; municipality: string | null };

/** Не больше 5 событий в сообщении. */
export const DIGEST_LIMIT = 5;

/** Компактный текст дайджеста. */
export function digestText(subscriptionTitle: string, events: DigestEvent[], total: number): string {
  const lines = events.slice(0, DIGEST_LIMIT).map((e) => {
    const date = humanDate(localParts(new Date(e.starts_at)).date, "ru", false);
    return `• ${date} · «${e.title}»${e.municipality ? ` · ${e.municipality}` : ""}`;
  });
  const rest = Math.max(0, total - Math.min(events.length, DIGEST_LIMIT));
  const out = [`🔔 Новые события: ${subscriptionTitle}`, "", ...lines];
  if (rest > 0) out.push("", `…и ещё ${rest}`);
  out.push("", "Дайджест — не чаще раза в сутки. Отписаться: /unsubscribe");
  return out.join("\n");
}

/** Deep-link «Смотреть все» — поиск на сайте с теми же фильтрами (имена параметров совпадают с GET /v1/occurrences). */
export function subscriptionUrl(municipality: string | null, categories: string[], period: string | null): string {
  const p = new URLSearchParams();
  if (municipality) p.set("municipality", municipality);
  if (categories.length) p.set("categories", categories.join(","));
  if (period) p.set("when", period);
  const qs = p.toString();
  return `${config.AFISHA_PUBLIC_BASE_URL}/search${qs ? `?${qs}` : ""}`;
}

type DueRow = {
  id: string;
  profile_id: string;
  title: string;
  query: { municipality?: string | null; categories?: string[]; period?: When | null };
  last_notified_at: Date | string | null;
  created_at: Date | string;
  channel: string;
  external_id: string;
  lang: string;
};

type EventRow = { starts_at: Date | string; title: string; municipality: string | null; total: number | string };

/** Тихие часы 22:00–09:00 по TZ региона: ночью дайджесты не отправляем. */
export function isQuietHours(now: Date): boolean {
  const hour = localParts(now).hour;
  return hour >= 22 || hour < 9;
}

/**
 * Одна итерация: подписки, которым давно не отправляли дайджест → новые события по фильтрам →
 * отправка транспортом канала + запись в notification (журнал рассылок) → last_notified_at = now.
 */
export async function sendSubscriptionDigests(
  db: Db,
  now: Date = new Date(),
): Promise<{ due: number; sent: number; skipped: number }> {
  const cutoff = new Date(now.getTime() - 24 * 3600_000);
  const quiet = isQuietHours(now);
  return db.transaction(async (tx) => {
    const due = (
      await tx.execute<DueRow>(sql`
        SELECT s.id, s.profile_id, s.title, s.query, s.last_notified_at, s.created_at,
               p.channel, p.external_id, p.lang
        FROM saved_search s
        JOIN profile p ON p.id = s.profile_id
        WHERE s.last_notified_at IS NULL OR s.last_notified_at <= ${cutoff}
        ORDER BY s.created_at
        LIMIT 200
        FOR UPDATE OF s SKIP LOCKED`)
    ).rows;
    let sent = 0;
    let skipped = 0;
    for (const s of due) {
      // транспорта нет (например, веб-подписка без Telegram) или ночь — пропускаем без обновления last_notified_at
      const transport = getTransport(s.channel);
      if (quiet || !transport) {
        skipped++;
        continue;
      }
      const municipality = s.query.municipality ?? null;
      const categories = s.query.categories ?? [];
      const period = s.query.period ?? null;
      const since = new Date(s.last_notified_at ?? s.created_at);
      const win = period ? resolveWindow({ when: period }, now) : null;
      const rows = (
        await tx.execute<EventRow>(sql`
          SELECT o.starts_at, e.title->>'ru' AS title, m.name->>'ru' AS municipality,
                 count(*) OVER () AS total
          FROM occurrence o
          JOIN event e ON e.id = o.event_id
          LEFT JOIN municipality m ON m.id = o.municipality_id
          WHERE e.moderation_status = 'published'
            AND o.status = 'scheduled'
            AND coalesce(o.ends_at, o.starts_at) > ${now}
            AND o.created_at > ${since}
            ${municipality ? sql`AND o.municipality_id = ${municipality}` : sql``}
            ${categories.length ? sql`AND e.category_codes && ${textArray(categories)}` : sql``}
            ${win ? sql`AND o.starts_at < ${win.endUtc} AND coalesce(o.ends_at, o.starts_at) >= ${win.startUtc}` : sql``}
          ORDER BY o.starts_at
          LIMIT ${DIGEST_LIMIT + 1}`)
      ).rows;
      if (rows.length === 0) {
        skipped++; // новых событий нет — молчим, навязчивость недопустима
        continue;
      }
      const events: DigestEvent[] = rows.map((r) => ({
        starts_at: r.starts_at instanceof Date ? r.starts_at : new Date(r.starts_at),
        title: r.title,
        municipality: r.municipality,
      }));
      const total = Number(rows[0]!.total);
      const note: OutgoingNotification = {
        profileId: s.profile_id,
        channel: s.channel,
        externalId: s.external_id,
        lang: s.lang,
        title: s.title,
        text: digestText(s.title, events, total),
        url: subscriptionUrl(municipality, categories, period),
        urlLabel: "Смотреть все",
      };
      let ok = false;
      try {
        ok = await transport(note);
      } catch (err) {
        log.warn({ err: String(err), profile: s.profile_id }, "notify.digest_transport_failed");
      }
      await tx.execute(sql`
        INSERT INTO notification (profile_id, kind, payload, status, sent_at)
        VALUES (${s.profile_id}, 'digest', ${JSON.stringify({ subscription_id: s.id, title: s.title, events: events.map((e) => e.title), total })}::jsonb, ${ok ? "sent" : "failed"}, ${ok ? now : null})`);
      if (!ok) {
        skipped++; // не отправлено — last_notified_at не трогаем, повторим в следующий час
        continue;
      }
      await tx.execute(sql`UPDATE saved_search SET last_notified_at = ${now}, updated_at = ${now} WHERE id = ${s.id}`);
      sent++;
    }
    return { due: due.length, sent, skipped };
  });
}
