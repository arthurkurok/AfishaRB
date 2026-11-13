"use client";
/** Тема: как в системе → светлая → тёмная. Выбор хранится только в этом браузере. */
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["system", "light", "dark"];
const KEY = "afisha.admin.theme";
const NAME: Record<Theme, string> = { system: "как в системе", light: "светлая", dark: "тёмная" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      /* хранилище недоступно — тема по системе */
    }
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* настройка действует до перезагрузки */
    }
  };

  const label = `Тема: ${NAME[theme]}`;
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={cycle}>
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
            <path d="M12 3l9 9-9 9z" fill="currentColor" />
          </g>
        )}
      </svg>
    </button>
  );
}
