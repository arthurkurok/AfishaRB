/**
 * Форматирование карточки события: цена, статус, дата в ромбе, фраза для скринридера.
 * Чистые функции без React — покрыты тестами.
 */
import type { OccurrenceCard, OccurrenceStatus } from "@afisha/contract";
import { formatDate, formatUntil, type Lang, monthShort, regionParts, type Translate } from "@afisha/i18n";

type Price = OccurrenceCard["event"]["price"];

const groupFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function money(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatRub(n: number): string {
  return groupFmt.format(n);
}

/** «Бесплатно», «от 400 ₽», «400–1 200 ₽», «500 ₽», «Цена уточняется». */
export function priceLabel(price: Price, t: Translate): string {
  if (price.is_free) return t("common.free");
  const min = money(price.min);
  const max = money(price.max);
  if (min === null && max === null) return t("common.priceUnknown");
  if (min !== null && max !== null && max > min)
    return t("common.priceRange", { min: formatRub(min), max: formatRub(max) });
  const v = min ?? max ?? 0;
  if (v === 0) return t("common.free");
  return min !== null && max === null
    ? t("common.priceFrom", { price: formatRub(v) })
    : t("common.priceExact", { price: formatRub(v) });
}

/** Короткая цена для чипа карточки: «от 400 ₽». */
export function priceShort(price: Price, t: Translate): string {
  if (price.is_free) return t("common.free");
  const min = money(price.min) ?? money(price.max);
  if (min === null) return t("common.priceUnknown");
  if (min === 0) return t("common.free");
  return t("common.priceFrom", { price: formatRub(min) });
}

export type StatusKind = Exclude<OccurrenceStatus, "scheduled"> | "few_left";

/** Статус для бейджа. «Мало билетов» — только если источник сообщил (availability). */
export function statusKind(o: Pick<OccurrenceCard, "status" | "availability">): StatusKind | null {
  if (o.status !== "scheduled") return o.status;
  if (o.availability === "sold_out") return "sold_out";
  if (o.availability === "few_left") return "few_left";
  return null;
}

export function statusLabel(
  o: Pick<OccurrenceCard, "status" | "availability" | "starts_at" | "previous_starts_at">,
  t: Translate,
  lang: Lang,
  tz: string,
): string | null {
  const kind = statusKind(o);
  if (!kind) return null;
  if (kind === "rescheduled")
    return t("status.rescheduledTo", { date: formatDate(regionParts(o.starts_at, tz).date, lang) });
  return t(`status.${kind}`);
}

/** Сеанс нельзя посетить: отменён, прошёл или отложен без даты. */
export function isInactive(status: OccurrenceStatus): boolean {
  return status === "cancelled" || status === "ended" || status === "postponed";
}

export interface DateBadge {
  /** Строка над числом: месяц или «до» */
  top: string;
  day: string;
  /** Строка под числом: время, месяц или «тиклем» */
  bottom: string;
  /** Полная фраза для скринридера */
  label: string;
}

export function dateBadge(
  o: Pick<OccurrenceCard, "starts_at" | "ends_at" | "is_range">,
  lang: Lang,
  tz: string,
  today: string,
): DateBadge {
  const start = regionParts(o.starts_at, tz);
  if (o.is_range && o.ends_at) {
    const end = regionParts(o.ends_at, tz);
    // Длительное событие, которое уже идёт: показываем дату окончания.
    if (start.date <= today && end.date > today) {
      const month = monthShort(end.month, lang);
      return {
        top: lang === "ba" ? month : "до",
        day: String(end.day),
        bottom: lang === "ba" ? "тиклем" : month,
        label: formatUntil(end.date, lang),
      };
    }
  }
  return {
    top: monthShort(start.month, lang),
    day: String(start.day),
    bottom: o.is_range ? "" : start.time,
    label: `${formatDate(start.date, lang, { weekday: true })}${o.is_range ? "" : `, ${start.time}`}`,
  };
}

/**
 * Карточка читается скринридером одной фразой (07-design §11):
 * «Спектакль „Буратино“, 0+, суббота, 7 ноября, 11:00, Театр кукол, от 400 ₽, мало билетов».
 */
export function cardSpeech(o: OccurrenceCard, t: Translate, lang: Lang, tz: string, today: string): string {
  const parts = [
    o.event.title,
    t("common.age", { age: o.event.age_rating }),
    dateBadge(o, lang, tz, today).label,
    o.venue?.name,
    priceShort(o.event.price, t),
    o.event.pushkin_card ? t("common.pushkin") : null,
    statusLabel(o, t, lang, tz),
  ];
  return parts.filter(Boolean).join(", ");
}

/** HTML-сущности в подписях из источников («МАУК&quot;РДК&quot;»). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Ссылка на маршрут в Яндекс Картах / 2ГИС по координатам площадки. */
export function routeLinks(geo: [number, number] | null, address: string | null) {
  if (!geo) {
    const q = encodeURIComponent(address ?? "");
    return { yandex: `https://yandex.ru/maps/?text=${q}`, twogis: `https://2gis.ru/search/${q}` };
  }
  const [lat, lon] = geo;
  return {
    yandex: `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`,
    twogis: `https://2gis.ru/routeSearch/rsType/car/to/${lon},${lat}`,
  };
}
