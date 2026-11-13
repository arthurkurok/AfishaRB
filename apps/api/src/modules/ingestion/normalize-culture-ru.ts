/** Нормализация сырых карточек Культура.РФ в промежуточную схему. Чистая функция — покрыта тестами. */
import sanitizeHtml from "sanitize-html";
import type { ImageInfo } from "../../db/schema.js";
import { classify } from "../catalog/index.js";
import { CULTURE_REGION_LOCALE_ID, slugFromSysname } from "../geo/index.js";
import type { NOrganization, NormalizedEvent, NSession, NVenue } from "./types.js";

export const SOURCE_ID = "culture_ru";
const CDN = "https://cdn.culture.ru/images/";
const AGE_VALUES = [0, 6, 12, 16, 18];
export const HORIZON_DAYS = 180;
export const COLLAPSE_THRESHOLD = 45; // больше сеансов на одной площадке — сворачиваем в интервал (выставки)

type Raw = Record<string, any>; // сырой JSON источника

const toDate = (v: unknown): Date | null => (typeof v === "string" && v ? new Date(v) : null);

export function cleanUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!/^https?:\/\//.test(u)) return null;
  try {
    const parsed = new URL(u);
    for (const k of [...parsed.searchParams.keys()]) {
      if (/^(utm_[a-z]+|yclid|gclid|fbclid)$/.test(k)) parsed.searchParams.delete(k);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Раскодировать HTML-сущности в простом тексте (метаданные источника приходят с &quot; и т.п.). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

export function htmlToText(fragment: string): string {
  // Теги удаляем и до, и после раскодирования сущностей: &#60;img …&#62; не должен стать живым тегом (MJ-21)
  return stripTags(decodeEntities(stripTags(fragment)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function stripTags(fragment: string): string {
  return fragment
    .replace(/<(script|style|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;| /g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function makeSummary(text: string, limit = 280): string {
  const t = text.split(/\s+/).join(" ").trim();
  if (t.length <= limit) return t;
  const cut = t.slice(0, limit);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (dot > limit * 0.5) return cut.slice(0, dot + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:—-]+$/, "")}…`;
}

/** 436-ФЗ: только 0/6/12/16/18; нестандартное значение округляем вверх (консервативно). */
export function normalizeAge(v: unknown): number | null {
  // Пустое значение — «не указано», а не 0+ (замечание жюри MJ-22)
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return AGE_VALUES.find((a) => n <= a) ?? 18;
}

function image(f: Raw | null | undefined): ImageInfo | null {
  if (!f?.publicId) return null;
  const meta = (f.meta ?? {}) as Raw;
  return {
    url: CDN + f.publicId,
    author: decodeEntities(String(meta.author ?? "")).trim() || null,
    source: decodeEntities(String(meta.source ?? "")).trim() || "Культура.РФ",
    license: null,
    width: (f.width as number) ?? null,
    height: (f.height as number) ?? null,
    color: (f.averageColor as string) ?? null,
  };
}

export const isRegionPlace = (p: Raw) => ((p.localeIds as number[]) ?? []).includes(CULTURE_REGION_LOCALE_ID);

export function collapseSessions(sessions: NSession[], now: Date): NSession[] {
  const lo = now.getTime() - 12 * 3600_000;
  const hi = now.getTime() + HORIZON_DAYS * 86400_000;
  const byVenue = new Map<string | null, NSession[]>();
  for (const s of sessions) {
    const end = (s.endsAt ?? s.startsAt).getTime();
    if (end < lo || s.startsAt.getTime() > hi) continue;
    const list = byVenue.get(s.venueExternalId) ?? [];
    list.push(s);
    byVenue.set(s.venueExternalId, list);
  }
  const out: NSession[] = [];
  for (const [venue, items] of byVenue) {
    items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    if (items.length <= COLLAPSE_THRESHOLD) {
      out.push(...items);
      continue;
    }
    const end = new Date(Math.max(...items.map((i) => (i.endsAt ?? i.startsAt).getTime())));
    out.push({
      externalId: `range:${venue}`,
      venueExternalId: venue,
      startsAt: items[0]!.startsAt,
      endsAt: end,
      isRange: true,
      ticketUrl: items[0]!.ticketUrl,
    });
  }
  return out;
}

/** Карточка Культура.РФ → NormalizedEvent. null — если в РБ нет ни одной площадки. */
export function normalizeCultureRu(detail: Raw, listed: Raw | null = null, now = new Date()): NormalizedEvent | null {
  const places = ((detail.places as Raw[]) ?? []).filter(isRegionPlace);
  if (places.length === 0) return null;
  const regionPlaceIds = new Set(places.map((p) => p._id));

  const rawText = String(detail.text ?? "")
    .replace(/^\[HTML\]/, "")
    .replace(/\[\/HTML\]$/, "");
  const descriptionHtml = sanitizeHtml(rawText, {
    allowedTags: ["p", "br", "b", "strong", "i", "em", "ul", "ol", "li", "a", "h3", "h4", "blockquote"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener nofollow", target: "_blank" }) },
  }).trim();
  const text = htmlToText(rawText);

  const genres = ((detail.genres as Raw[]) ?? []).map((g) => String(g.title ?? ""));
  const sourceTags = ((detail.tags as Raw[]) ?? []).map((t) => String(t.title ?? t.name ?? ""));
  const age = normalizeAge(detail.ageRestriction);
  const title = decodeEntities(String(detail.title ?? ""))
    .split(/\s+/)
    .join(" ")
    .trim();
  const { categories, tags } = classify(genres, sourceTags, title, text, age);

  const price = (detail.price ?? {}) as Raw;
  const pmin = price.min ?? detail.priceMin;
  const pmax = price.max ?? detail.priceMax;
  const priceMin = pmin === null || pmin === undefined ? null : Number(pmin).toFixed(2);
  const priceMax = pmax === null || pmax === undefined ? null : Number(pmax).toFixed(2);
  const isFree = (pmax !== undefined && pmax !== null && Number(pmax) === 0) || (Number(pmin) === 0 && !pmax);
  if (isFree) tags.push("free");
  const pushkin = Boolean(listed?.isPushkinsCard ?? detail.isPushkinsCard);
  if (pushkin) tags.push("pushkin");
  const accessible = Boolean(listed?.isAccessible ?? detail.isAccessible) || tags.includes("accessible");
  if (accessible && !tags.includes("accessible")) tags.push("accessible");

  // Стабильный ключ площадки — eipskId (id места в PRO.Культура); _id места уникален для пары «событие–место».
  const venueKey = (p: Raw) => String(p.eipskId ?? p._id);
  const venues: NVenue[] = places.map((p) => {
    const coords = ((p.location as Raw)?.coordinates as [number, number] | undefined) ?? [null, null];
    const locale = (p.locale ?? {}) as Raw;
    return {
      externalId: venueKey(p),
      name: String(p.title ?? "")
        .split(/\s+/)
        .join(" ")
        .trim(),
      address: (p.address as string) ?? null,
      lon: coords[0] ?? null,
      lat: coords[1] ?? null,
      municipalityId: locale.sysName ? slugFromSysname(String(locale.sysName)) : null,
      municipalityTitle: (locale.title as string) ?? null,
      cultureLocaleId: (locale._id as number) ?? null,
      externalIds: {
        culture_place_id: p._id,
        eipsk_place_id: p.eipskId ?? null,
        culture_institute_id: (p.institute as Raw)?._id ?? null,
      },
    };
  });

  const sale = cleanUrl(detail.saleLink);
  const placeSale = new Map(places.map((p) => [String(p._id), cleanUrl(p.saleLink)]));
  const placeToVenue = new Map(places.map((p) => [String(p._id), venueKey(p)]));
  let sessions: NSession[] = [];
  for (const s of (detail.seances as Raw[]) ?? []) {
    if (!regionPlaceIds.has(s.placeId)) continue;
    const start = toDate(s.startDate);
    if (!start) continue;
    const end = toDate(s.endDate);
    sessions.push({
      externalId: String(s._id),
      venueExternalId: placeToVenue.get(String(s.placeId)) ?? String(s.placeId),
      startsAt: start,
      endsAt: end,
      isRange: Boolean(end && end.getTime() - start.getTime() > 20 * 3600_000),
      ticketUrl: placeSale.get(String(s.placeId)) ?? sale,
    });
  }
  sessions = collapseSessions(sessions, now);

  const images: ImageInfo[] = [];
  for (const f of [detail.thumbnailFile, ...((detail.files as Raw[]) ?? []).slice(0, 6)]) {
    const img = image(f as Raw);
    if (img && !images.some((i) => i.url === img.url)) images.push(img);
  }

  const o = ((detail.organizations as Raw[]) ?? [])[0];
  const organization: NOrganization | null = o
    ? {
        externalId: String(o._id),
        name: String(o.title ?? "")
          .split(/\s+/)
          .join(" ")
          .trim(),
        shortName: (o.shortTitle as string) ?? null,
        externalIds: { culture_org_id: o._id, eipsk_org_id: o.eipskOrganizationId ?? null },
      }
    : null;

  const updates = places.map((p) => toDate(p.updateDate)).filter((d): d is Date => d !== null);
  const id = String(detail._id);
  return {
    sourceId: SOURCE_ID,
    externalId: id,
    title,
    summary: makeSummary(text),
    descriptionHtml,
    categories,
    tags: [...new Set(tags)].sort(),
    sourceGenres: genres,
    ageRating: age,
    priceMin,
    priceMax,
    isFree,
    pushkinCard: pushkin,
    accessible,
    isPermanent: Boolean(detail.permanent),
    ticketUrl: sale,
    images,
    organization,
    venues,
    sessions,
    sourceUrl: `https://www.culture.ru/events/${id}/${detail.name ?? ""}`,
    sourceUpdatedAt: updates.length ? new Date(Math.max(...updates.map((d) => d.getTime()))) : null,
    languages: tags.includes("on_bashkir") ? ["ba"] : ["ru"],
  };
}
