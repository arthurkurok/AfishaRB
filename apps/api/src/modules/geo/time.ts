/**
 * Время региона. Всё «сегодня/в субботу/вечером» считается в часовом поясе региона (Asia/Yekaterinburg, UTC+5),
 * никогда не в поясе сервера. В Екатеринбургском поясе нет перехода на летнее время, но код от этого не зависит.
 */
import { REGION_TZ } from "./reference.js";

export type LocalDate = string; // YYYY-MM-DD

const dtf = new Intl.DateTimeFormat("en-CA", {
  timeZone: REGION_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export type LocalParts = { date: LocalDate; hour: number; minute: number; weekday: number };

const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(d: Date): LocalParts {
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WD[p.weekday ?? "Mon"] ?? 1,
  };
}

/** Смещение пояса региона в минутах для момента d (например +300). */
export function tzOffsetMinutes(d: Date): number {
  const p = localParts(d);
  const [y, m, day] = p.date.split("-").map(Number) as [number, number, number];
  const asUtc = Date.UTC(y, m - 1, day, p.hour, p.minute, d.getUTCSeconds());
  return Math.round((asUtc - d.getTime()) / 60000);
}

/** Начало локального дня (00:00 в поясе региона) как Date (UTC-момент). */
export function startOfLocalDay(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const off = tzOffsetMinutes(guess);
  return new Date(guess.getTime() - off * 60000);
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/** Форматирование момента в RFC 3339 с офсетом региона: 2026-11-07T11:00:00+05:00 */
export function toRegionIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const p = localParts(d);
  const off = tzOffsetMinutes(d);
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${p.date}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}${sign}${hh}:${mm}`;
}

export function todayLocal(now: Date = new Date()): LocalDate {
  return localParts(now).date;
}

const MONTHS_RU_GEN = [
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
];
const WEEKDAYS_RU = ["", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const WEEKDAYS_RU_SHORT = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_BA_GEN = [
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
];
const WEEKDAYS_BA = ["", "дүшәмбе", "шишәмбе", "шаршамбы", "кесаҙна", "йома", "шәмбе", "йәкшәмбе"];

export function humanDate(date: LocalDate, lang: "ru" | "ba" = "ru", withWeekday = true): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  const wd = weekdayOf(date);
  if (lang === "ba") return `${d} ${MONTHS_BA_GEN[m - 1]}${withWeekday ? `, ${WEEKDAYS_BA[wd]}` : ""}`;
  return `${withWeekday ? `${capitalize(WEEKDAYS_RU[wd] ?? "")}, ` : ""}${d} ${MONTHS_RU_GEN[m - 1]}`;
}

export function shortWeekday(date: LocalDate): string {
  return WEEKDAYS_RU_SHORT[weekdayOf(date)] ?? "";
}

export function humanTime(d: Date): string {
  const p = localParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
