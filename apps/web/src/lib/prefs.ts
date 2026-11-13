/**
 * Пользовательские настройки сайта в localStorage (тема, контраст, город). Только удобство в этом браузере:
 * если хранилище недоступно (приватный режим, запрет), сайт работает с настройками по умолчанию.
 * В виджете хранилище не используется вовсе (03-functional-spec §6.2).
 */
export type PrefKey = "afisha.theme" | "afisha.contrast" | "afisha.city" | "afisha.device";

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

/**
 * Идентификатор устройства для API без регистрации (X-Device-Id, как у избранного): создаётся один раз
 * и хранится в localStorage. Подписки и избранное не содержат персональных данных (ТЗ 6.2).
 */
export function deviceId(): string {
  const existing = readPref("afisha.device");
  if (existing && /^[0-9a-f-]{16,64}$/i.test(existing)) return existing;
  const id = globalThis.crypto.randomUUID();
  writePref("afisha.device", id);
  return id;
}
