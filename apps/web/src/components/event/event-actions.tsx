"use client";
/**
 * Действия в паспорте события: «Поделиться» (системное меню или копирование ссылки)
 * и «Сообщить о неточности» (POST /v1/reports, попадает в очередь модерации).
 */
import { relativeTime } from "@afisha/i18n";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { postReport, type ReportBody } from "@/lib/api";
import { useI18n } from "@/lib/i18n-client";
import styles from "./event-actions.module.css";

const REASONS: ReportBody["reason"][] = ["cancelled", "wrong_time", "wrong_price", "wrong_place", "other"];

export function ShareButton({ title, text, url }: { title: string; text: string; url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const full = url.startsWith("http") ? url : new URL(url, window.location.origin).toString();
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: full });
        return;
      } catch {
        /* пользователь закрыл меню — пробуем скопировать */
      }
    }
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt(t("event.share"), full);
    }
  };
  return (
    <>
      <button type="button" className="btn btn--secondary" onClick={share}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("event.share")}
      </button>
      <span role="status" className={styles.toast}>
        {copied ? t("event.linkCopied") : ""}
      </span>
    </>
  );
}

export function ReportButton({ eventId, occurrenceId }: { eventId: string; occurrenceId?: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const open = () => {
    setState("idle");
    dialog.current?.showModal();
  };

  const submit = async (form: HTMLFormElement) => {
    const data = new FormData(form);
    const reason = String(data.get("reason") ?? "other") as ReportBody["reason"];
    const comment = String(data.get("comment") ?? "").trim();
    setState("sending");
    try {
      await postReport({ event_id: eventId, occurrence_id: occurrenceId, reason, comment: comment || undefined });
      setState("sent");
      form.reset();
    } catch {
      setState("error");
    }
  };

  return (
    <>
      <button type="button" className="btn btn--ghost" onClick={open}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M5 21V4h11l-1.5 4L16 12H5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </svg>
        {t("event.report")}
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="report-title">
        <form
          method="dialog"
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(e.currentTarget);
          }}
        >
          <div className={styles.head}>
            <h2 id="report-title">{t("report.title")}</h2>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("common.close")}
              onClick={() => dialog.current?.close()}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M6 6l12 12M18 6 6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {state === "sent" ? (
            <div className={styles.done} role="status">
              <p>{t("report.sent")}</p>
              <button type="button" className="btn btn--primary" onClick={() => dialog.current?.close()}>
                {t("common.close")}
              </button>
            </div>
          ) : (
            <>
              <p className="muted">{t("report.lead")}</p>
              <fieldset className={styles.reasons}>
                <legend>{t("report.reason")}</legend>
                {REASONS.map((r, i) => (
                  <label key={r} className="check">
                    <input type="radio" name="reason" value={r} defaultChecked={i === 0} required />
                    <span>{t(`report.reasons.${r}`)}</span>
                  </label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="report-comment">
                  {t("report.comment")} <span className="muted">({t("common.optional")})</span>
                </label>
                <textarea
                  id="report-comment"
                  name="comment"
                  className="textarea"
                  maxLength={1000}
                  aria-describedby="report-hint"
                />
                <p id="report-hint" className="caption">
                  {t("report.commentHint")}
                </p>
              </div>
              {state === "error" ? (
                <p role="alert" className={styles.error}>
                  {t("report.error")}
                </p>
              ) : null}
              <button type="submit" className="btn btn--primary" disabled={state === "sending"}>
                {state === "sending" ? t("report.sending") : t("report.submit")}
              </button>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}

/** Описание: длинный текст сворачивается, кнопка раскрывает его целиком. */
export function Collapsible({ children, lines = 8 }: { children: ReactNode; lines?: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [needed, setNeeded] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight <= el.clientHeight + 4) setNeeded(false);
  }, []);
  return (
    <div>
      <div
        ref={box}
        id="event-description"
        className={styles.collapsible}
        data-open={open || !needed || undefined}
        style={{ ["--lines" as string]: lines }}
      >
        {children}
      </div>
      {needed ? (
        <button
          type="button"
          className="btn btn--ghost btn--small"
          aria-expanded={open}
          aria-controls="event-description"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t("event.collapse") : t("event.expand")}
        </button>
      ) : null}
    </div>
  );
}

/** «Проверено 40 минут назад»: пересчитывается на клиенте, чтобы ISR-кэш страницы не делал время устаревшим. */
export function RelativeTime({ iso, initial }: { iso: string; initial: string }) {
  const { lang } = useI18n();
  const [text, setText] = useState(initial);
  useEffect(() => {
    const update = () => setText(relativeTime(iso, lang));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso, lang]);
  return <time dateTime={iso}>{text}</time>;
}
