"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n-client";
import styles from "./code-block.module.css";

/** Блок кода с кнопкой «Скопировать» (статус копирования озвучивается). */
export function CodeBlock({ code, label, language }: { code: string; label: string; language?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* буфер обмена недоступен — код можно выделить вручную */
    }
  };
  return (
    <figure className={styles.block}>
      <figcaption className={styles.head}>
        <span>{label}</span>
        <button type="button" className="btn btn--ghost btn--small" onClick={copy}>
          {copied ? t("common.copied") : t("common.copy")}
          <span className="sr-only">: {label}</span>
        </button>
      </figcaption>
      {/* Прокручиваемая область должна получать фокус с клавиатуры (WCAG 2.1.1, axe scrollable-region-focusable). */}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: прокручиваемый блок кода */}
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: подпись прокручиваемой области */}
      <pre className={styles.pre} tabIndex={0} aria-label={label}>
        <code data-language={language} translate="no">
          {code}
        </code>
      </pre>
      <span role="status" className="sr-only">
        {copied ? t("common.copied") : ""}
      </span>
    </figure>
  );
}
