/**
 * Пользовательские настройки сайта в localStorage (тема, контраст, город). Только удобство в этом браузере:
 * если хранилище недоступно (приватный режим, запрет), сайт работает с настройками по умолчанию.
 * В виджете хранилище не используется вовсе (03-functional-spec §6.2).
 */
export type PrefKey = "afisha.theme" | "afisha.contrast" | "afisha.city";

export function readPref(key: PrefKey): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: PrefKey, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — настройка действует до перезагрузки */
  }
}
