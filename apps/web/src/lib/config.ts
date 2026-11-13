/**
 * Конфигурация сайта из окружения. Регионально-специфичное (пояс, контакты, владелец) — в настройках, а не в коде
 * (CLAUDE.md, инвариант 7). Значения по умолчанию — для локальной разработки.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");
/** Адрес API для серверного рендеринга (внутренняя сеть); по умолчанию совпадает с публичным. */
export const API_BASE_SERVER = (process.env.API_BASE_INTERNAL ?? API_BASE).replace(/\/$/, "");
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const REGION_TZ = process.env.NEXT_PUBLIC_REGION_TZ ?? "Asia/Yekaterinburg";
/** Контакт для обращений, в т. ч. о рекомендательных технологиях (149-ФЗ, ст. 10.2-2). Задаёт владелец. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "afisha@tamasha.example";
export const OPERATOR_NAME = process.env.NEXT_PUBLIC_OPERATOR_NAME ?? "Министерство культуры Республики Башкортостан";
/** Адрес бандла виджета (CDN); по умолчанию сайт раздаёт его сам из /widget/v1/afisha.js. */
export const WIDGET_SRC = process.env.NEXT_PUBLIC_WIDGET_SRC ?? `${SITE_URL}/widget/v1/afisha.js`;
/** ISR: как часто перестраивать страницы с афишей, секунд. */
export const REVALIDATE_SECONDS = 300;
