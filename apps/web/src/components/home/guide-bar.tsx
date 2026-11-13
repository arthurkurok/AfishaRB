import type { Translate } from "@afisha/i18n";
import Link from "next/link";
import type { Hrefs } from "@/lib/hrefs";
import styles from "./guide-bar.module.css";

/** Строка Гида на главной: обычная GET-форма (работает и без JavaScript) + примеры запросов. */
export function GuideBar({ t, hrefs, compact = false }: { t: Translate; hrefs: Hrefs; compact?: boolean }) {
  const examples = [t("home.example1"), t("home.example2"), t("home.example3"), t("home.example4")];
  return (
    <section className={`${styles.wrap} ${compact ? styles.compact : ""}`} aria-labelledby="guide-bar-label">
      <div className={styles.main}>
        <search>
          <form action={hrefs.guide()} method="get" className={styles.form}>
            <label htmlFor="guide-bar-q" id="guide-bar-label" className={styles.label}>
              {t("home.guideLabel")}
            </label>
            <div className={styles.row}>
              <input
                id="guide-bar-q"
                name="q"
                className={`input ${styles.input}`}
                placeholder={t("home.guidePlaceholder")}
                autoComplete="off"
                enterKeyHint="search"
                maxLength={1000}
                required
              />
              <button type="submit" className="btn btn--primary">
                {t("home.guideSubmit")}
              </button>
            </div>
          </form>
        </search>
        <p className="caption" id="guide-examples-label">
          {t("home.guideExamples")}
        </p>
        <ul className={`chips ${styles.examples}`} aria-labelledby="guide-examples-label">
          {examples.map((ex) => (
            <li key={ex}>
              <Link className={`chip ${styles.example}`} href={hrefs.guide(ex)} prefetch={false}>
                {ex}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
