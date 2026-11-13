/**
 * Даты и время в часовом поясе региона (CLAUDE.md, инвариант 2): «сегодня», «завтра», «в субботу»
 * вычисляются в поясе региона, а не в поясе браузера или сервера.
 * Названия месяцев и дней недели для ba — собственный словарь (в CLDR данных для ba недостаточно, 07-design §12).
 */
import { pluralCategory } from "./format";
import type { Lang } from "./types";

export const REGION_TZ_DEFAULT = "Asia/Yekaterinburg";

const MONTHS_GENITIVE: Record<Lang, string[]> = {
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
  ba: [
    "ғинуар",
    "февраль",
    "март",
    "апрель",
    "май",
    "июнь",
    "июль",
    "август",
    "сентябрь",
    "октябрь",
    "ноябрь",
    "декабрь",
  ],
};
/** Дательный падеж месяца для «до 23 февраля» → «23 февралгә тиклем». */
const MONTHS_DATIVE_BA = [
  "ғинуарға",
  "февралгә",
  "мартҡа",
  "апрелгә",
  "майға",
  "июнгә",
  "июлгә",
  "августҡа",
  "сентябргә",
  "октябргә",
  "ноябргә",
  "декабргә",
];
const MONTHS_SHORT: Record<Lang, string[]> = {
  ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  ba: ["ғин", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
};
/** Понедельник — первый. */
const WEEKDAYS: Record<Lang, string[]> = {
  ru: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"],
  ba: ["дүшәмбе", "шишәмбе", "шаршамбы", "кесаҙна", "йома", "шәмбе", "йәкшәмбе"],
};
const WEEKDAYS_SHORT: Record<Lang, string[]> = {
  ru: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"],
  ba: ["дш", "шш", "шр", "кс", "йм", "шб", "йш"],
};
const WORDS: Record<Lang, { today: string; tomorrow: string; yesterday: string; justNow: string }> = {
  ru: { today: "сегодня", tomorrow: "завтра", yesterday: "вчера", justNow: "только что" },
  ba: { today: "бөгөн", tomorrow: "иртәгә", yesterday: "кисә", justNow: "хәҙер генә" },
};

const capitalize = (s: string) => (s ? s[0]!.toLocaleUpperCase("ru") + s.slice(1) : s);

export interface RegionParts {
  /** YYYY-MM-DD в поясе региона */
  date: string;
  /** HH:MM в поясе региона */
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Части даты момента времени в поясе региона. Принимает RFC 3339 с любым офсетом или Date. */
export function regionParts(value: string | Date, tz: string = REGION_TZ_DEFAULT): RegionParts {
  const d = typeof value === "string" ? new Date(value) : value;
  const parts = Object.fromEntries(
    formatterFor(tz)
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    year,
    month,
    day,
    hour,
    minute,
  };
}

/** «Сегодня» в поясе региона: YYYY-MM-DD. */
export function todayIn(tz: string = REGION_TZ_DEFAULT, now: Date = new Date()): string {
  return regionParts(now, tz).date;
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Разница в днях между календарными датами (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a);
  const pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** 0 — понедельник, 6 — воскресенье. */
export function weekdayIndex(date: string): number {
  const { y, m, d } = parseDate(date);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekdayName(date: string, lang: Lang): string {
  return WEEKDAYS[lang][weekdayIndex(date)]!;
}

export function weekdayShort(date: string, lang: Lang): string {
  return WEEKDAYS_SHORT[lang][weekdayIndex(date)]!;
}

export function monthShort(month: number, lang: Lang): string {
  return MONTHS_SHORT[lang][month - 1]!;
}

/** «7 ноября» / «7 ноябрь»; с опциями — «суббота, 7 ноября 2027». */
export function formatDate(
  date: string,
  lang: Lang,
  opts: { weekday?: boolean; year?: boolean; capital?: boolean } = {},
): string {
  const { y, m, d } = parseDate(date);
  let s = `${d} ${MONTHS_GENITIVE[lang][m - 1]}`;
  if (opts.year) s += lang === "ba" ? ` ${y} й.` : ` ${y}`;
  if (opts.weekday) s = `${weekdayName(date, lang)}, ${s}`;
  return opts.capital ? capitalize(s) : s;
}

/** «до 23 февраля» / «23 февралгә тиклем». */
export function formatUntil(date: string, lang: Lang): string {
  const { m, d } = parseDate(date);
  return lang === "ba" ? `${d} ${MONTHS_DATIVE_BA[m - 1]} тиклем` : `до ${d} ${MONTHS_GENITIVE.ru[m - 1]}`;
}

/** Заголовок дня в ленте: «Сегодня», «Завтра», «Суббота, 7 ноября». */
export function dayHeading(date: string, lang: Lang, today: string): string {
  const diff = daysBetween(today, date);
  const w = WORDS[lang];
  if (diff === 0) return capitalize(w.today);
  if (diff === 1) return capitalize(w.tomorrow);
  if (diff === -1) return capitalize(w.yesterday);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return formatDate(date, lang, { weekday: true, year: !sameYear, capital: true });
}

/** «сегодня, 19:00», «завтра, 11:00», «суббота, 7 ноября, 11:00». */
export function formatDateTime(iso: string, lang: Lang, today: string, tz: string = REGION_TZ_DEFAULT): string {
  const p = regionParts(iso, tz);
  const diff = daysBetween(today, p.date);
  const w = WORDS[lang];
  const day =
    diff === 0
      ? w.today
      : diff === 1
        ? w.tomorrow
        : formatDate(p.date, lang, { weekday: true, year: p.date.slice(0, 4) !== today.slice(0, 4) });
  return `${day}, ${p.time}`;
}

const RELATIVE: Record<
  Lang,
  { minutes: Record<string, string>; hours: Record<string, string>; days: Record<string, string> }
> = {
  ru: {
    minutes: { one: "# минуту назад", few: "# минуты назад", many: "# минут назад", other: "# минуты назад" },
    hours: { one: "# час назад", few: "# часа назад", many: "# часов назад", other: "# часа назад" },
    days: { one: "# день назад", few: "# дня назад", many: "# дней назад", other: "# дня назад" },
  },
  ba: {
    minutes: { other: "# минут элек" },
    hours: { other: "# сәғәт элек" },
    days: { other: "# көн элек" },
  },
};

/** «только что», «40 минут назад», «3 часа назад», «2 дня назад» / «40 минут элек». */
export function relativeTime(iso: string, lang: Lang, now: Date = new Date()): string {
  const diffMin = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (diffMin < 1) return WORDS[lang].justNow;
  const pick = (forms: Record<string, string>, n: number) =>
    (forms[pluralCategory(lang, n)] ?? forms.other ?? "#").replace("#", String(n));
  if (diffMin < 60) return pick(RELATIVE[lang].minutes, diffMin);
  const hours = Math.round(diffMin / 60);
  if (hours < 24) return pick(RELATIVE[lang].hours, hours);
  return pick(RELATIVE[lang].days, Math.round(hours / 24));
}

/** Время HH:MM в поясе региона. */
export function formatTime(iso: string, tz: string = REGION_TZ_DEFAULT): string {
  return regionParts(iso, tz).time;
}

/** Ближайшая суббота (или сегодня, если сегодня суббота). */
export function nextSaturday(today: string): string {
  const idx = weekdayIndex(today);
  return addDays(today, idx <= 5 ? 5 - idx : 6);
}
