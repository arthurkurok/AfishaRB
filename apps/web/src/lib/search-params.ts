/**
 * Состояние фильтров поиска в URL (/search?...). Имена параметров совпадают с API `GET /v1/occurrences`,
 * поэтому ссылку на поиск можно открыть, отправить и превратить в запрос к API без перевода.
 */
import type { CategoryCode, TagCode } from "@afisha/contract";
import type { Lang } from "@afisha/i18n";

export const WHEN_VALUES = ["today", "tomorrow", "weekend", "week", "month"] as const;
export type When = (typeof WHEN_VALUES)[number];
export const TIME_OF_DAY = ["morning", "day", "evening"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];
export const SORT_VALUES = ["relevance", "date", "price", "distance", "popular"] as const;
export type Sort = (typeof SORT_VALUES)[number];
export const CATEGORY_CODES: readonly CategoryCode[] = [
  "theatre",
  "music",
  "museum",
  "kids",
  "folk",
  "cinema",
  "education",
];
export const TAG_CODES: readonly TagCode[] = [
  "free",
  "pushkin",
  "premiere",
  "family",
  "youth",
  "accessible",
  "on_bashkir",
  "outdoor",
  "master_class",
  "excursion",
  "festival",
];
export const PRICE_STEPS = [500, 1000, 2000] as const;
export const RADIUS_STEPS = [1, 3, 10, 30] as const;
export const CHILD_AGES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] as const;

export interface Filters {
  q: string;
  when: When | null;
  date_from: string | null;
  date_to: string | null;
  time_of_day: TimeOfDay[];
  municipality: string[];
  categories: CategoryCode[];
  tags: TagCode[];
  free: boolean;
  price_max: number | null;
  age: number | null;
  pushkin: boolean;
  accessible: boolean;
  hide_sold_out: boolean;
  sort: Sort | null;
  near: string | null;
  radius_km: number | null;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  when: null,
  date_from: null,
  date_to: null,
  time_of_day: [],
  municipality: [],
  categories: [],
  tags: [],
  free: false,
  price_max: null,
  age: null,
  pushkin: false,
  accessible: false,
  hide_sold_out: false,
  sort: null,
  near: null,
  radius_km: null,
};

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function getter(raw: RawParams): (key: string) => string | undefined {
  if (raw instanceof URLSearchParams) return (k) => raw.get(k) ?? undefined;
  return (k) => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NEAR_RE = /^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;
const SLUG_RE = /^[a-z0-9-]{2,80}$/;

function list<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  if (!value) return [];
  const set = new Set(value.split(",").map((s) => s.trim()));
  return allowed.filter((a) => set.has(a));
}

function bool(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function num(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/** Разбирает и валидирует параметры: мусор и неизвестные значения отбрасываются. */
export function parseFilters(raw: RawParams): Filters {
  const get = getter(raw);
  const when = get("when");
  const dateFrom = get("date_from");
  const dateTo = get("date_to");
  const sort = get("sort");
  const near = get("near");
  const age = num(get("age"), 0, 17);
  return {
    q: (get("q") ?? "").trim().slice(0, 300),
    when: (WHEN_VALUES as readonly string[]).includes(when ?? "") ? (when as When) : null,
    date_from: dateFrom && DATE_RE.test(dateFrom) ? dateFrom : null,
    date_to: dateTo && DATE_RE.test(dateTo) ? dateTo : null,
    time_of_day: list(get("time_of_day"), TIME_OF_DAY),
    municipality: (get("municipality") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SLUG_RE.test(s)),
    categories: list(get("categories"), CATEGORY_CODES),
    tags: list(get("tags"), TAG_CODES),
    free: bool(get("free")),
    price_max: num(get("price_max"), 0, 1_000_000),
    age: age === null ? null : Math.round(age),
    pushkin: bool(get("pushkin")),
    accessible: bool(get("accessible")),
    hide_sold_out: bool(get("hide_sold_out")),
    sort: (SORT_VALUES as readonly string[]).includes(sort ?? "") ? (sort as Sort) : null,
    near: near && NEAR_RE.test(near) ? near : null,
    radius_km: num(get("radius_km"), 0.5, 200),
  };
}

/** Параметры URL сайта: только отличающиеся от значений по умолчанию, в стабильном порядке. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.date_from || f.date_to) {
    if (f.date_from) p.set("date_from", f.date_from);
    if (f.date_to) p.set("date_to", f.date_to);
  } else if (f.when) p.set("when", f.when);
  if (f.time_of_day.length) p.set("time_of_day", f.time_of_day.join(","));
  if (f.near) {
    p.set("near", f.near);
    if (f.radius_km) p.set("radius_km", String(f.radius_km));
  } else if (f.municipality.length) p.set("municipality", f.municipality.join(","));
  if (f.categories.length) p.set("categories", f.categories.join(","));
  if (f.tags.length) p.set("tags", f.tags.join(","));
  if (f.free) p.set("free", "true");
  else if (f.price_max !== null) p.set("price_max", String(f.price_max));
  if (f.age !== null) p.set("age", String(f.age));
  if (f.pushkin) p.set("pushkin", "true");
  if (f.accessible) p.set("accessible", "true");
  if (f.hide_sold_out) p.set("hide_sold_out", "true");
  if (f.sort) p.set("sort", f.sort);
  return p;
}

/** Сортировка, которая реально применяется: без текста запроса лента идёт по дате (с заголовками дней). */
export function effectiveSort(f: Filters): Sort {
  if (f.sort) return f.sort;
  return f.q ? "relevance" : "date";
}

/** Запрос к API: те же параметры + язык, лимит, курсор и сортировка по умолчанию. */
export function filtersToApiQuery(
  f: Filters,
  opts: { lang: Lang; limit?: number; cursor?: string | null },
): URLSearchParams {
  const p = filtersToParams(f);
  p.set("sort", effectiveSort(f));
  if (p.get("sort") === "distance" && !f.near) p.set("sort", "date");
  p.set("lang", opts.lang);
  p.set("limit", String(opts.limit ?? 24));
  if (opts.cursor) p.set("cursor", opts.cursor);
  return p;
}

export function searchHref(f: Partial<Filters>): string {
  const qs = filtersToParams({ ...EMPTY_FILTERS, ...f }).toString();
  return qs ? `/search?${qs}` : "/search";
}

export function countActive(f: Filters): number {
  return activeKeys(f).length;
}

export type FilterKey =
  | "q"
  | "when"
  | "dates"
  | "time_of_day"
  | "place"
  | "categories"
  | "tags"
  | "price"
  | "age"
  | "pushkin"
  | "accessible"
  | "hide_sold_out";

export function activeKeys(f: Filters): FilterKey[] {
  const keys: FilterKey[] = [];
  if (f.q) keys.push("q");
  if (f.date_from || f.date_to) keys.push("dates");
  else if (f.when) keys.push("when");
  if (f.time_of_day.length) keys.push("time_of_day");
  if (f.near || f.municipality.length) keys.push("place");
  if (f.categories.length) keys.push("categories");
  if (f.tags.length) keys.push("tags");
  if (f.free || f.price_max !== null) keys.push("price");
  if (f.age !== null) keys.push("age");
  if (f.pushkin) keys.push("pushkin");
  if (f.accessible) keys.push("accessible");
  if (f.hide_sold_out) keys.push("hide_sold_out");
  return keys;
}

/** Снимает один фильтр (для чипа «×»). */
export function withoutKey(f: Filters, key: FilterKey): Filters {
  switch (key) {
    case "q":
      return { ...f, q: "" };
    case "when":
      return { ...f, when: null };
    case "dates":
      return { ...f, date_from: null, date_to: null };
    case "time_of_day":
      return { ...f, time_of_day: [] };
    case "place":
      return { ...f, municipality: [], near: null, radius_km: null };
    case "categories":
      return { ...f, categories: [] };
    case "tags":
      return { ...f, tags: [] };
    case "price":
      return { ...f, free: false, price_max: null };
    case "age":
      return { ...f, age: null };
    case "pushkin":
      return { ...f, pushkin: false };
    case "accessible":
      return { ...f, accessible: false };
    case "hide_sold_out":
      return { ...f, hide_sold_out: false };
  }
}
