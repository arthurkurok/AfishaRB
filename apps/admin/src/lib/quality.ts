/**
 * Индекс полноты данных учреждения и подсказки «что улучшить» (03-functional-spec §7, «Качество данных»).
 * Составляющие повторяют формулу индекса в API (apps/api, lifecycle: quality_score), чтобы подсказки
 * объясняли именно те баллы, которых не хватает.
 */
import type { EventDetail } from "@afisha/contract";
import type { DataQualityRow } from "./admin-types";

export type QualityLevel = "low" | "mid" | "high";

export function qualityLevel(score: number): QualityLevel {
  if (score < 50) return "low";
  if (score < 75) return "mid";
  return "high";
}

export const QUALITY_LEVEL_LABEL: Record<QualityLevel, string> = {
  low: "низкий",
  mid: "средний",
  high: "высокий",
};

export interface MissingPart {
  key: "image" | "description" | "price" | "tickets" | "accessibility" | "geo";
  label: string;
  points: number;
}

const DESCRIPTION_MIN = 300;

function textLength(html: string): number {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

type DetailLike = Pick<
  EventDetail,
  "images" | "image" | "description_html" | "price" | "ticket_url" | "accessibility" | "occurrences"
>;

/** Чего не хватает карточке события — с баллами индекса, которые это принесёт. */
export function missingParts(e: DetailLike): MissingPart[] {
  const out: MissingPart[] = [];
  if (e.images.length === 0 && !e.image) out.push({ key: "image", label: "фото", points: 15 });
  if (textLength(e.description_html) < DESCRIPTION_MIN)
    out.push({ key: "description", label: "описание от 300 знаков", points: 10 });
  if (e.price.min === null && !e.price.is_free) out.push({ key: "price", label: "цена", points: 15 });
  if (!e.ticket_url && !e.price.is_free) out.push({ key: "tickets", label: "ссылка на билеты", points: 10 });
  if (Object.keys(e.accessibility ?? {}).length === 0)
    out.push({ key: "accessibility", label: "сведения о доступной среде", points: 10 });
  if (!e.occurrences.some((o) => o.venue?.geo)) out.push({ key: "geo", label: "координаты площадки", points: 10 });
  return out;
}

export interface Hint {
  key: MissingPart["key"];
  count: number;
  text: string;
}

const HINT_TEXT: Record<MissingPart["key"], (n: number) => string> = {
  image: (n) => `Добавьте фото к ${events(n)}: карточки с фото поднимаются выше в выдаче и их чаще открывают.`,
  description: (n) => `Дополните описание у ${events(n)} — хотя бы 300 знаков о том, что увидит зритель.`,
  price: (n) => `Укажите цену или отметьте «Бесплатно» у ${events(n)}: жители часто ищут «до 500 ₽».`,
  tickets: (n) => `Добавьте ссылку на покупку билетов у ${events(n)}.`,
  accessibility: (n) => `Опишите доступную среду для ${events(n)}: пандус, лифт, места для колясок.`,
  geo: (n) => `Уточните адрес площадки у ${events(n)}: без координат событие не видно на карте и в поиске «рядом».`,
};

function events(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "события" : "событий";
  return `${n} ${word}`;
}

/** Подсказки по набору карточек: сначала то, что даёт больше баллов и встречается чаще. */
export function qualityHints(details: DetailLike[]): Hint[] {
  const counts = new Map<MissingPart["key"], { n: number; points: number }>();
  for (const d of details) {
    for (const part of missingParts(d)) {
      const c = counts.get(part.key) ?? { n: 0, points: part.points };
      c.n += 1;
      counts.set(part.key, c);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n * b[1].points - a[1].n * a[1].points)
    .map(([key, c]) => ({ key, count: c.n, text: HINT_TEXT[key](c.n) }));
}

/** Средний индекс 0–100 по карточкам (quality_score в API — доля 0…1). */
export function averageIndex(scores: (number | null)[]): number | null {
  const known = scores.filter((s): s is number => typeof s === "number" && Number.isFinite(s));
  if (known.length === 0) return null;
  return Math.round((known.reduce((a, b) => a + b, 0) / known.length) * 100);
}

/* ---------- Качество данных: сортировка ---------- */

export type QualitySortKey = "name" | "events" | "avg_quality" | "no_image" | "no_price";
export type SortDir = "asc" | "desc";

export function sortQuality(rows: readonly DataQualityRow[], key: QualitySortKey, dir: SortDir): DataQualityRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return sign * a.name.localeCompare(b.name, "ru");
    // Неизвестный индекс — самый низкий: такие учреждения должны быть наверху при сортировке «сначала худшие».
    const va = a[key] ?? -1;
    const vb = b[key] ?? -1;
    return sign * (va - vb) || a.name.localeCompare(b.name, "ru");
  });
}
