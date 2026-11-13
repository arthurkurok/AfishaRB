/**
 * Верификатор фактов (docs/05-ai-agent.md §2.7): каждая фраза модели сверяется с фактами карточки.
 * Числа, время, даты, цены, возраст, дни недели и названия в кавычках должны совпасть с данными события.
 * Не прошла проверку — фраза заменяется шаблонной, инцидент пишется в трассировку.
 */
import type { OccurrenceCard } from "@afisha/contract";
import { humanTime, localParts, weekdayOf } from "../geo/index.js";

export type Verdict = { ok: boolean; problems: string[] };

const MONTHS = [
  "январ",
  "феврал",
  "март",
  "апрел",
  "ма",
  "июн",
  "июл",
  "август",
  "сентябр",
  "октябр",
  "ноябр",
  "декабр",
];
const WEEKDAYS: [RegExp, number][] = [
  [/понедельник/u, 1],
  [/вторник/u, 2],
  [/(?<![\p{L}])сред[уаы](?![\p{L}])/u, 3],
  [/четверг/u, 4],
  [/пятниц/u, 5],
  [/суббот/u, 6],
  [/воскресень/u, 7],
];
const FORBIDDEN =
  /лучш|обязательно понрав|гарантир|парковк|погод|самый|самая|незабываем|не пропустите|скидк|акци[яи]|успейте купить|бесплатн\p{L}* парков|розыгрыш/iu;

const norm = (s: string) => s.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");

function cardDates(c: Pick<OccurrenceCard, "starts_at" | "ends_at" | "is_range">) {
  const start = new Date(c.starts_at);
  const end = c.ends_at ? new Date(c.ends_at) : start;
  return { start, end, sp: localParts(start), ep: localParts(end) };
}

export function verifyReason(text: string, card: OccurrenceCard): Verdict {
  const problems: string[] = [];
  const t = norm(text);
  if (text.length > 220) problems.push("слишком длинно");
  if (FORBIDDEN.test(t)) problems.push("оценочное или непроверяемое утверждение");

  const { start, end, sp, ep } = cardDates(card);
  const times = new Set([humanTime(start), humanTime(end)]);
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)/g)) {
    const hhmm = `${m[1]!.padStart(2, "0")}:${m[2]}`;
    if (!times.has(hhmm) && !card.is_range) problems.push(`время ${hhmm} не совпадает`);
  }
  for (const m of t.matchAll(/в (\d{1,2}) (утра|дня|вечера|часов)/gu)) {
    let h = Number(m[1]);
    if ((m[2] === "вечера" || m[2] === "дня") && h < 12) h += 12;
    if (h !== sp.hour && !card.is_range) problems.push(`время «${m[0]}» не совпадает`);
  }
  const prices = [card.event.price.min, card.event.price.max].filter(Boolean).map((p) => Math.round(Number(p)));
  for (const m of t.matchAll(/(\d[\d\s]{0,6}\d|\d)\s*(?:₽|руб|р\.)/gu)) {
    const v = Number(m[1]!.replace(/\s/g, ""));
    if (!prices.includes(v)) problems.push(`цена ${v} ₽ не совпадает`);
  }
  if (/бесплатн|вход свободн/u.test(t) && !card.event.price.is_free) problems.push("событие не бесплатное");
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})\s?\+/g)) {
    if (Number(m[1]) !== card.event.age_rating) problems.push(`возраст ${m[1]}+ не совпадает`);
  }
  for (const m of t.matchAll(/(?<!\d)(\d{1,2})\s+([\p{L}]+)/gu)) {
    const mi = MONTHS.findIndex((x) => m[2]!.startsWith(x));
    if (mi === -1) continue;
    // Год не пишут — пробуем год начала и следующий (выставка с ноября по февраль)
    const md = `${String(mi + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    const y = Number(sp.date.slice(0, 4));
    const candidates = [`${y}-${md}`, `${y + 1}-${md}`];
    const inRange = candidates.some((d) => (card.is_range ? d >= sp.date && d <= ep.date : d === sp.date));
    if (!inRange) problems.push(`дата «${m[0]}» не совпадает`);
  }
  for (const [rx, wd] of WEEKDAYS) {
    if (rx.test(t) && !card.is_range && weekdayOf(sp.date) !== wd) problems.push(`день недели не совпадает`);
  }
  for (const m of text.matchAll(/«([^»]{3,})»/g)) {
    const q = norm(m[1]!);
    const known = norm(`${card.event.title} ${card.venue?.name ?? ""} ${card.event.organization ?? ""}`);
    if (!known.includes(q)) problems.push(`название «${m[1]}» не из карточки`);
  }
  return { ok: problems.length === 0, problems };
}

/** Проверка сводки: числа в ней не могут превышать число показанных карточек. */
export function verifySummary(text: string, shown: number): Verdict {
  const problems: string[] = [];
  if (FORBIDDEN.test(norm(text))) problems.push("оценочное утверждение");
  for (const m of text.matchAll(/(?<!\d)(\d{1,3})(?!\d)\s+(вариант|событ|меропри|спектак|концерт)/gu)) {
    if (Number(m[1]) > shown) problems.push(`в сводке ${m[1]}, показано ${shown}`);
  }
  return { ok: problems.length === 0, problems };
}
