/**
 * Атрибуты <afisha-rb> → параметры запроса к API. Чистые функции — покрыты тестами.
 * Неизвестные и некорректные значения игнорируются: виджет на чужом сайте не должен ломаться от опечатки.
 */
import type { CategoryCode, TagCode } from "@afisha/contract";

export const LAYOUTS = ["carousel", "list", "grid", "compact"] as const;
export type Layout = (typeof LAYOUTS)[number];
export type Theme = "light" | "dark" | "auto";
export type WidgetLang = "ru" | "ba";

const CATEGORIES: readonly CategoryCode[] = ["theatre", "music", "museum", "kids", "folk", "cinema", "education"];
const TAGS: readonly TagCode[] = [
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

export const OBSERVED = [
  "municipality",
  "venue",
  "organization",
  "categories",
  "tags",
  "free",
  "pushkin",
  "age",
  "limit",
  "layout",
  "lang",
  "theme",
  "accent",
  "radius",
  "api-base",
  "site-base",
] as const;

export interface WidgetOptions {
  municipality: string[];
  venue: string | null;
  organization: string | null;
  categories: CategoryCode[];
  tags: TagCode[];
  free: boolean;
  pushkin: boolean;
  age: number | null;
  limit: number;
  layout: Layout;
  lang: WidgetLang;
  theme: Theme;
  accent: string | null;
  radius: number | null;
  apiBase: string;
  siteBase: string;
}

type Attr = (name: string) => string | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{2,80}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function list<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set(raw.split(",").map((s) => s.trim()));
  return allowed.filter((a) => set.has(a));
}

function flag(raw: string | null): boolean {
  return raw !== null && raw !== "false" && raw !== "0";
}

function base(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().replace(/\/$/, "") : fallback;
  } catch {
    return fallback;
  }
}

export function parseOptions(
  attr: Attr,
  defaults: { apiBase: string; siteBase: string; lang?: string },
): WidgetOptions {
  const limit = Number(attr("limit"));
  const age = attr("age");
  const ageNum = Number(age);
  const radius = attr("radius");
  const radiusNum = Number(radius);
  const lang = attr("lang") ?? defaults.lang ?? "ru";
  const theme = attr("theme");
  const layout = attr("layout");
  const accent = attr("accent");
  return {
    municipality: (attr("municipality") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SLUG.test(s)),
    venue: UUID.test(attr("venue") ?? "") ? attr("venue") : null,
    organization: UUID.test(attr("organization") ?? "") ? attr("organization") : null,
    categories: list(attr("categories"), CATEGORIES),
    tags: list(attr("tags"), TAGS),
    free: flag(attr("free")),
    pushkin: flag(attr("pushkin")),
    age: age !== null && age !== "" && Number.isInteger(ageNum) && ageNum >= 0 && ageNum <= 17 ? ageNum : null,
    limit: Number.isFinite(limit) && limit >= 1 ? Math.min(24, Math.floor(limit)) : 8,
    layout: (LAYOUTS as readonly string[]).includes(layout ?? "") ? (layout as Layout) : "carousel",
    lang: lang.toLowerCase().startsWith("ba") ? "ba" : "ru",
    theme: theme === "light" || theme === "dark" ? theme : "auto",
    accent: accent && HEX.test(accent) ? accent : null,
    radius:
      radius !== null && radius !== "" && Number.isFinite(radiusNum) && radiusNum >= 0 && radiusNum <= 32
        ? radiusNum
        : null,
    apiBase: base(attr("api-base"), defaults.apiBase),
    siteBase: base(attr("site-base"), defaults.siteBase),
  };
}

/** Параметры GET /v1/occurrences. По умолчанию — ближайший месяц, по релевантности. */
export function apiQuery(o: WidgetOptions): URLSearchParams {
  const p = new URLSearchParams();
  p.set("when", "month");
  if (o.municipality.length) p.set("municipality", o.municipality.join(","));
  if (o.venue) p.set("venue", o.venue);
  if (o.organization) p.set("organization", o.organization);
  if (o.categories.length) p.set("categories", o.categories.join(","));
  if (o.tags.length) p.set("tags", o.tags.join(","));
  if (o.free) p.set("free", "true");
  if (o.pushkin) p.set("pushkin", "true");
  if (o.age !== null) p.set("age", String(o.age));
  p.set("lang", o.lang);
  p.set("limit", String(o.limit));
  return p;
}

/** Ссылка «Вся афиша» на сайт с теми же фильтрами. */
export function siteSearchUrl(o: WidgetOptions): string {
  const p = new URLSearchParams();
  if (o.municipality.length) p.set("municipality", o.municipality.join(","));
  if (o.categories.length) p.set("categories", o.categories.join(","));
  if (o.free) p.set("free", "true");
  if (o.pushkin) p.set("pushkin", "true");
  if (o.age !== null) p.set("age", String(o.age));
  const qs = p.toString();
  return `${o.siteBase}${o.lang === "ba" ? "/ba" : ""}/search${qs ? `?${qs}` : ""}`;
}

export function eventUrl(o: WidgetOptions, eventId: string): string {
  return `${o.siteBase}${o.lang === "ba" ? "/ba" : ""}/e/${encodeURIComponent(eventId)}`;
}
