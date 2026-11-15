"use client";
/**
 * Форма обратной связи в футере (ТЗ: разделы 3, 12): ошибка перевода, данные о событии, идея.
 * Без персональных данных — только текст и адрес страницы. Защита от спама: honeypot-поле
 * «website» (скрыто от человека, роботы заполняют — заявка тихо отбрасывается на сервере)
 * и лимит 5 заявок в час с адреса на маршруте.
 */
import { useState } from "react";
import { type FeedbackBody, sendFeedback } from "@/lib/api";
import { useI18n } from "@/lib/i18n-client";
import styles from "./feedback-form.module.css";

type FeedbackKey = "kind_translation" | "kind_data" | "kind_idea" | "kind_other";

const KINDS: { value: FeedbackBody["kind"]; label: FeedbackKey }[] = [
  { value: "translation", label: "kind_translation" },
  { value: "data", label: "kind_data" },
  { value: "idea", label: "kind_idea" },
  { value: "other", label: "kind_other" },
];

export function FeedbackForm() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackBody["kind"]>("data");
  const [text, setText] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async () => {
    if (state !== "idle" || text.trim().length < 3) return;
    setState("busy");
    try {
      await sendFeedback({ kind, text: text.trim(), page: window.location.pathname, website: website || undefined });
      setState("done");
      setText("");
    } catch {
      setState("error");
    }
  };

  if (!open)
    return (
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(true)}>
        {t("feedback.title")}
      </button>
    );

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="caption">{t("feedback.hint")}</p>
      <label className={`caption ${styles.kind}`}>
        {t("feedback.kind")}
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as FeedbackBody["kind"])}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {t(`feedback.${k.label}`)}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.textLabel}>
        <span className="caption">{t("feedback.text")}</span>
        <textarea
          className={`textarea ${styles.text}`}
          rows={3}
          maxLength={2000}
          value={text}
          required
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {/* honeypot: скрытое поле, человек его не видит и не заполняет */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className={styles.honeypot}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />
      <div className={styles.row}>
        <button type="submit" className="btn btn--secondary btn--small" disabled={state === "busy"}>
          {state === "busy" ? t("feedback.sending") : t("feedback.send")}
        </button>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      {state === "done" ? (
        <p role="status" className={`caption ${styles.status}`}>
          {t("feedback.thanks")}
        </p>
      ) : null}
      {state === "error" ? (
        <p role="alert" className={`caption ${styles.error}`}>
          {t("feedback.error")}
        </p>
      ) : null}
    </form>
  );
}
