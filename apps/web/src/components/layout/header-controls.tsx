"use client";
/**
 * Переключатели в шапке: язык (ru/ba), тема (светлая/тёмная/как в системе) и режим
 * «Крупный текст и высокий контраст». Выбор хранится только в браузере пользователя.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { localePath, stripLocale } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import { readPref, writePref } from "@/lib/prefs";
import styles from "./header.module.css";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["system", "light", "dark"];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function HeaderControls() {
  const { lang, t } = useI18n();
  const pathname = usePathname() ?? "/";
  const [theme, setTheme] = useState<Theme>("system");
  const [contrast, setContrast] = useState(false);

  useEffect(() => {
    const stored = readPref("afisha.theme");
    if (stored === "light" || stored === "dark") setTheme(stored);
    setContrast(readPref("afisha.contrast") === "high");
  }, []);

  const otherLang = lang === "ru" ? "ba" : "ru";
  const otherHref = localePath(otherLang, stripLocale(pathname));

  const cycleTheme = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    setTheme(next);
    applyTheme(next);
    writePref("afisha.theme", next);
  };

  const toggleContrast = () => {
    const next = !contrast;
    setContrast(next);
    if (next) document.documentElement.setAttribute("data-contrast", "high");
    else document.documentElement.removeAttribute("data-contrast");
    writePref("afisha.contrast", next ? "high" : "normal");
  };

  const themeName =
    theme === "light"
      ? t("settings.themeLight")
      : theme === "dark"
        ? t("settings.themeDark")
        : t("settings.themeSystem");

  return (
    <>
      <a
        className={styles.langLink}
        href={otherHref}
        hrefLang={otherLang}
        lang={otherLang}
        onClick={(e) => {
          // Сохраняем фильтры и запрос при смене языка.
          if (window.location.search) {
            e.preventDefault();
            window.location.assign(otherHref + window.location.search);
          }
        }}
      >
        <span aria-hidden="true">{otherLang === "ba" ? "Баш" : "Рус"}</span>
        <span className="sr-only">{otherLang === "ba" ? "Башҡортса" : "Русский"}</span>
      </a>
      <button
        type="button"
        className="icon-btn"
        aria-pressed={contrast}
        aria-label={t("settings.contrast")}
        title={contrast ? t("settings.contrastOff") : t("settings.contrastOn")}
        onClick={toggleContrast}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M3 18 8 5l5 13M4.8 13.5h6.4M15 18l3.5-9 3.5 9M16 15.5h5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`${t("settings.theme")}: ${themeName}`}
        title={`${t("settings.theme")}: ${themeName}`}
        onClick={cycleTheme}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          {theme === "dark" ? (
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth={2} />
          ) : theme === "light" ? (
            <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
              <path d="M12 8l4 4-4 4-4-4z" />
            </g>
          ) : (
            <g fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3l9 9-9 9-9-9z" />
              <path d="M12 3v18" />
              <path d="M12 3l9 9-9 9z" fill="currentColor" />
            </g>
          )}
        </svg>
      </button>
    </>
  );
}
