/**
 * Конфигурация админки из окружения. Регионально-специфичное (часовой пояс) — в настройках, а не в коде
 * (CLAUDE.md, инвариант 7). Значения по умолчанию — для локальной разработки.
 */
import { REGION_TZ_DEFAULT } from "@afisha/i18n";

const trim = (s: string) => s.replace(/\/$/, "");

/** Адрес API для серверных запросов. Админ-API вызывается только с сервера: токен не попадает в браузер. */
export const ADMIN_API_BASE = trim(process.env.ADMIN_API_BASE ?? "http://localhost:8000");
/** Публичный сайт: ссылки на паспорт события. */
export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
/** Часовой пояс региона: все даты в кабинете показываются и вводятся в нём (Уфа, UTC+5). */
export const REGION_TZ = process.env.NEXT_PUBLIC_REGION_TZ ?? REGION_TZ_DEFAULT;
/** Подпись часового пояса для полей ввода. */
export const REGION_TZ_LABEL = process.env.NEXT_PUBLIC_REGION_TZ_LABEL ?? "по Уфе, UTC+5";

/** Ссылка на паспорт события на сайте. */
export function siteEventUrl(eventId: string): string {
  return `${SITE_URL}/e/${encodeURIComponent(eventId)}`;
}
