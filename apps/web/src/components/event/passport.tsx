/**
 * Блок «Паспорт» (03-functional-spec §1.5 п. 7, 07-design §7): источники-«печати», «проверено N минут назад»,
 * уровень доверия, свежесть и вертикальная лента истории изменений с ромбами-узлами.
 */
import type { EventDetail } from "@afisha/contract";
import { formatDateTime, type Lang, relativeTime, type Translate } from "@afisha/i18n";
import { REGION_TZ } from "@/lib/config";
import { RelativeTime } from "./event-actions";
import styles from "./passport.module.css";

export function Passport({ event, lang, t, today }: { event: EventDetail; lang: Lang; t: Translate; today: string }) {
  const p = event.provenance;
  const sourceTitle = new Map(p.sources.map((s) => [s.id, s.title]));
  const history = [...event.history].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <section className={styles.passport} aria-labelledby="passport-title" id="passport">
      <div className={styles.head}>
        <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.icon}>
          <path d="M12 2l9 10-9 10-9-10z" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
          <path
            d="M8.5 12l2.5 2.5 4.5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <h2 id="passport-title">{t("event.passport")}</h2>
          <p className="muted">{t("event.passportLead")}</p>
        </div>
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>{t("event.sources")}</dt>
          <dd>
            <ul className={styles.seals}>
              {p.sources.map((s) => (
                <li key={s.id} className={styles.seal}>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title}
                      <span className="sr-only"> {t("common.newTab")}</span>
                    </a>
                  ) : (
                    <span>{s.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt>{t("event.trust")}</dt>
          <dd>{t(`event.trustLevels.${p.trust_level}`)}</dd>
        </div>
      </dl>
      <p className={styles.verified} data-freshness={p.freshness}>
        {p.last_verified_at ? (
          <>
            {t("event.verified", { ago: "" }).trim()}{" "}
            <RelativeTime iso={p.last_verified_at} initial={relativeTime(p.last_verified_at, lang)} />
          </>
        ) : (
          t("event.notVerified")
        )}
        <span className={styles.freshness}> · {t(`event.freshness.${p.freshness}`)}</span>
      </p>

      <h3 className={styles.historyTitle}>{t("event.history")}</h3>
      {history.length ? (
        <ol className={styles.timeline}>
          {history.map((h) => (
            <li key={`${h.at}-${h.kind}-${h.field ?? ""}`} className={styles.node} data-kind={h.kind}>
              <time dateTime={h.at} className={styles.when}>
                {formatDateTime(h.at, lang, today, REGION_TZ)}
              </time>
              <p lang={lang === "ru" ? undefined : "ru"}>{h.text}</p>
              {h.source ? (
                <p className="caption">{t("event.historySource", { source: sourceTitle.get(h.source) ?? h.source })}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{t("event.historyEmpty")}</p>
      )}
    </section>
  );
}
