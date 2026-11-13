/**
 * Разметка виджета. Все строки из API экранируются; изображения — только https.
 * Карточка — одна ссылка на паспорт события на сайте (открывается в новой вкладке).
 */
import type { OccurrenceCard } from "@afisha/contract";
import { formatUntil, monthShort, regionParts, todayIn, weekdayShort } from "@afisha/i18n";
import { wt } from "./i18n";
import { eventUrl, siteSearchUrl, type WidgetOptions } from "./options";

const TZ = "Asia/Yekaterinburg";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** HTML-сущности из источников («МАУК&quot;РДК&quot;») — раскодировать до экранирования. */
function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&amp;/g, "&");
}

function safeImage(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function money(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function priceText(o: OccurrenceCard, lang: WidgetOptions["lang"]): string {
  const p = o.event.price;
  const min = money(p.min) ?? money(p.max);
  if (p.is_free || min === 0) return wt(lang, "free");
  if (min === null) return "";
  return wt(lang, "from", { price: new Intl.NumberFormat("ru-RU").format(min) });
}

export function dateText(o: OccurrenceCard, lang: WidgetOptions["lang"], today: string): string {
  const s = regionParts(o.starts_at, TZ);
  if (o.is_range && o.ends_at) {
    const e = regionParts(o.ends_at, TZ);
    if (s.date <= today && e.date > today) return formatUntil(e.date, lang);
  }
  const day = `${weekdayShort(s.date, lang)}, ${s.day} ${monthShort(s.month, lang)}`;
  return o.is_range ? day : `${day} · ${s.time}`;
}

const STATUS: Record<string, Parameters<typeof wt>[1]> = {
  cancelled: "cancelled",
  rescheduled: "rescheduled",
  postponed: "rescheduled",
  sold_out: "soldOut",
  unverified: "unverified",
  few_left: "fewLeft",
};

function statusOf(o: OccurrenceCard): string | null {
  if (o.status !== "scheduled" && o.status !== "ended") return o.status;
  if (o.availability === "sold_out") return "sold_out";
  if (o.availability === "few_left") return "few_left";
  return null;
}

export function cardHtml(o: OccurrenceCard, opts: WidgetOptions, today: string): string {
  const e = o.event;
  const cat = e.categories[0] ?? "education";
  const img = safeImage(e.image?.url);
  const status = statusOf(o);
  const statusKey = status ? STATUS[status] : undefined;
  const price = priceText(o, opts.lang);
  const place = [o.venue?.name, o.venue?.municipality].filter(Boolean).join(" · ");
  const chips = [
    statusKey ? `<span class="chip st st-${esc(status)}">${esc(wt(opts.lang, statusKey))}</span>` : "",
    price ? `<span class="chip ${e.price.is_free ? "free" : ""}">${esc(price)}</span>` : "",
    `<span class="chip age">${esc(e.age_rating)}+</span>`,
    e.pushkin_card ? `<span class="chip">${esc(wt(opts.lang, "pushkin"))}</span>` : "",
  ].join("");
  return `<li><a class="card${o.status === "cancelled" ? " cancelled" : ""}" style="--cat:var(--color-category-${esc(cat)})" href="${esc(eventUrl(opts, e.id))}" target="_blank" rel="noopener"><div class="media">${
    img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : `<div class="art"></div>`
  }<span class="cut"></span></div><div class="body"><span class="date">${esc(dateText(o, opts.lang, today))}</span><span class="title" lang="ru">${esc(decode(e.title))}</span>${
    place ? `<span class="place">${esc(decode(place))}</span>` : ""
  }<span class="chips">${chips}</span></div></a></li>`;
}

export function shellHtml(opts: WidgetOptions, inner: string, carousel: boolean): string {
  const title = esc(wt(opts.lang, "title"));
  const layoutClass = opts.layout === "list" ? "list-l" : opts.layout;
  const nav = carousel
    ? `<div class="nav"><button type="button" class="prev" aria-label="${esc(wt(opts.lang, "prev"))}">‹</button><button type="button" class="next" aria-label="${esc(wt(opts.lang, "next"))}">›</button></div>`
    : "";
  return `<section class="w ${layoutClass}" aria-labelledby="afisha-title" lang="${opts.lang}"><div class="head"><h2 id="afisha-title">${title}</h2><a class="all" href="${esc(
    siteSearchUrl(opts),
  )}" target="_blank" rel="noopener">${esc(wt(opts.lang, "all"))} →</a></div>${inner}${nav}<p class="foot">${esc(wt(opts.lang, "powered"))}</p></section>`;
}

export function listHtml(items: OccurrenceCard[], opts: WidgetOptions, now = new Date()): string {
  const today = todayIn(TZ, now);
  const label = esc(wt(opts.lang, "title"));
  const carousel = opts.layout === "carousel";
  const list = `<ul class="list"${carousel ? ` tabindex="0" aria-label="${label}"` : ""}>${items.map((o) => cardHtml(o, opts, today)).join("")}</ul>`;
  // Карусель: регион с подписью; список внутри остаётся списком (li ⊂ ul) для скринридеров.
  return carousel ? `<div role="region" aria-roledescription="carousel" aria-label="${label}">${list}</div>` : list;
}

export function loadingHtml(opts: WidgetOptions): string {
  const n = Math.min(opts.limit, opts.layout === "compact" ? 3 : 4);
  return `<div aria-busy="true"><p class="sr">${esc(wt(opts.lang, "loading"))}</p><ul class="list">${'<li class="sk"></li>'.repeat(n)}</ul></div>`;
}

export function stateHtml(text: string, retry?: string): string {
  return `<div class="state" role="${retry ? "alert" : "status"}"><p>${esc(text)}</p>${retry ? `<button type="button" class="retry">${esc(retry)}</button>` : ""}</div>`;
}
