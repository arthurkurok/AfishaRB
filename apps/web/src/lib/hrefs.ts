/**
 * Адреса страниц с учётом языка и «поверхности»: сайт (/…), Mini App (/tma/…), iframe-виджет (/embed — ссылки ведут на сайт).
 * Русская версия живёт в корне, башкирская — под /ba (03-functional-spec §2).
 */
import type { Lang } from "@afisha/i18n";
import { SITE_URL } from "./config";
import { type Filters, searchHref } from "./search-params";

export type Surface = "site" | "tma" | "embed";

export function localePath(lang: Lang, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === "ru") return clean;
  return clean === "/" ? "/ba" : `/ba${clean}`;
}

/** Путь без языкового префикса: /ba/search → /search (внутренний /ru/… после rewrite — тоже). */
export function stripLocale(pathname: string): string {
  const m = /^\/(ru|ba)(\/.*)?$/.exec(pathname);
  if (!m) return pathname;
  return m[2] ?? "/";
}

export interface Hrefs {
  surface: Surface;
  home: string;
  event: (id: string) => string;
  search: (f?: Partial<Filters>) => string;
  guide: (q?: string) => string;
  municipality: (id: string) => string;
  /** Открывать ли ссылки событий в новой вкладке (виджет на чужом сайте). */
  external: boolean;
}

export function hrefs(lang: Lang, surface: Surface = "site"): Hrefs {
  const prefix = surface === "tma" ? "/tma" : "";
  const abs = surface === "embed" ? SITE_URL : "";
  const lp = (p: string) => abs + localePath(lang, prefix + p);
  return {
    surface,
    home: lp(prefix ? "" : "/"),
    event: (id) => lp(`/e/${id}`),
    search: (f) => lp(searchHref(f ?? {})),
    guide: (q) => lp(q ? `/guide?q=${encodeURIComponent(q)}` : "/guide"),
    municipality: (id) => abs + localePath(lang, `/m/${id}`),
    external: surface === "embed",
  };
}
