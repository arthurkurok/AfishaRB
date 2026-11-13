export const LANGS = ["ru", "ba"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "ru";

export function isLang(value: unknown): value is Lang {
  return value === "ru" || value === "ba";
}

/** Пути к строковым листьям словаря: "event.tickets", "status.cancelled". */
export type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** BCP 47-тег для атрибута lang и Intl. */
export const HTML_LANG: Record<Lang, string> = { ru: "ru", ba: "ba" };
