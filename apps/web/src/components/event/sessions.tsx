/**
 * Сеансы события со статусом каждого (03-functional-spec §1.5 п. 3, §1.6). Первые шесть — сразу,
 * остальные — под раскрывашкой «Все даты». Старая дата перенесённого сеанса зачёркнута.
 */
import type { EventDetail } from "@afisha/contract";
import { formatDate, formatDateTime, formatUntil, type Lang, regionParts, type Translate } from "@afisha/i18n";
import { REGION_TZ } from "@/lib/config";
import { decodeEntities, statusKind, statusLabel } from "@/lib/format";
import styles from "./sessions.module.css";
import { StatusBadge } from "./status-badge";

type Occ = EventDetail["occurrences"][number];

function Row({
  o,
  lang,
  t,
  today,
  mainVenue,
}: {
  o: Occ;
  lang: Lang;
  t: Translate;
  today: string;
  mainVenue?: string;
}) {
  const kind = statusKind(o);
  const label = statusLabel(o, t, lang, REGION_TZ);
  const start = regionParts(o.starts_at, REGION_TZ);
  const when =
    o.is_range && o.ends_at
      ? `${formatDate(start.date, lang)} — ${formatUntil(regionParts(o.ends_at, REGION_TZ).date, lang)}`
      : formatDateTime(o.starts_at, lang, today, REGION_TZ);
  return (
    <li className={styles.row} data-status={o.status}>
      <div className={styles.when}>
        <span className={o.status === "cancelled" || o.status === "ended" ? styles.struck : undefined}>{when}</span>
        {o.status === "rescheduled" && o.previous_starts_at ? (
          <span className={styles.prev}>
            {t("status.wasDate", { date: "" })}
            <s>{formatDateTime(o.previous_starts_at, lang, today, REGION_TZ)}</s>
          </span>
        ) : null}
      </div>
      {o.venue && o.venue.name !== mainVenue ? (
        <div className={styles.venue} lang={lang === "ru" ? undefined : "ru"}>
          {decodeEntities(o.venue.name)}
        </div>
      ) : null}
      <div className={styles.side}>
        {kind && label ? <StatusBadge kind={kind} label={label} /> : null}
        {o.status_reason ? (
          <span className="caption">{t("event.statusReason", { reason: o.status_reason })}</span>
        ) : null}
        {o.ticket_url && !["cancelled", "ended", "sold_out"].includes(o.status) ? (
          <a href={o.ticket_url} target="_blank" rel="noopener noreferrer" className="btn btn--secondary btn--small">
            {t("event.tickets")}
            <span className="sr-only"> {t("common.newTab")}</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function Sessions({ event, lang, t, today }: { event: EventDetail; lang: Lang; t: Translate; today: string }) {
  const list = event.occurrences;
  const mainVenue = list[0]?.venue?.name;
  const first = list.slice(0, 6);
  const rest = list.slice(6);
  return (
    <section aria-labelledby="sessions-title" className={styles.sessions} id="sessions">
      <h2 id="sessions-title">
        {t("event.sessions")} <span className={styles.count}>· {t("event.sessionsCount", { count: list.length })}</span>
      </h2>
      <ul className={styles.list}>
        {first.map((o) => (
          <Row key={o.id} o={o} lang={lang} t={t} today={today} mainVenue={mainVenue} />
        ))}
      </ul>
      {rest.length ? (
        <details className={styles.more}>
          <summary className="btn btn--ghost">
            {t("event.allSessions")} ({list.length})
          </summary>
          <ul className={styles.list}>
            {rest.map((o) => (
              <Row key={o.id} o={o} lang={lang} t={t} today={today} mainVenue={mainVenue} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
