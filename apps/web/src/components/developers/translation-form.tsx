"use client";
/**
 * «Предложить правку перевода» (07-design §12). Отдельного API для правок пока нет —
 * форма готовит письмо команде (mailto). Персональные данные не собираются.
 */
import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n-client";

export function TranslationForm({ email }: { email: string }) {
  const { t } = useI18n();
  const id = useId();
  const [sent, setSent] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const subject = encodeURIComponent(`Афиша РБ: правка башкирского перевода`);
        const body = encodeURIComponent(
          `${t("about.translationWhere")}:\n${String(data.get("where") ?? "")}\n\n${t("about.translationSuggestion")}:\n${String(data.get("fix") ?? "")}\n\n${window.location.href}`,
        );
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        setSent(true);
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-where`}>{t("about.translationWhere")}</label>
        <input id={`${id}-where`} name="where" className="input" required maxLength={500} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-fix`}>{t("about.translationSuggestion")}</label>
        <textarea id={`${id}-fix`} name="fix" className="textarea" required maxLength={2000} lang="ba" />
      </div>
      <div>
        <button type="submit" className="btn btn--primary">
          {t("about.translationSend")}
        </button>
      </div>
      <p role="status" className="caption">
        {sent ? t("about.translationSent") : ""}
      </p>
    </form>
  );
}
