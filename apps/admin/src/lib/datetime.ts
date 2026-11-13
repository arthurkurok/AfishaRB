/**
 * Даты и время кабинета в часовом поясе региона (CLAUDE.md, инвариант 2). Сотрудник вводит дату и время
 * «по Уфе», в API уходит RFC 3339 с офсетом региона; показываем тоже в поясе региона, а не браузера или сервера.
 */
import { formatDate, formatDateTime, regionParts, relativeTime, todayIn } from "@afisha/i18n";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidDate(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

/** Смещение пояса в минутах для момента времени: Asia/Yekaterinburg → 300. */
export function offsetMinutes(instant: Date, tz: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Локальные дата и время региона → RFC 3339 с офсетом: («2026-11-20», «19:00») → «2026-11-20T19:00:00+05:00».
 * Офсет считается для этого момента (на случай поясов с переходом на летнее время).
 */
export function zonedToIso(date: string, time: string, tz: string): string {
  if (!isValidDate(date)) throw new RangeError(`Неверная дата: ${date}`);
  if (!isValidTime(time)) throw new RangeError(`Неверное время: ${time}`);
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, hh, mm);
  let off = offsetMinutes(new Date(naive), tz);
  const corrected = offsetMinutes(new Date(naive - off * 60_000), tz);
  if (corrected !== off) off = corrected;
  return `${date}T${time}:00${formatOffset(off)}`;
}

/** Момент времени → поля формы в поясе региона: { date: «2026-11-20», time: «19:00» }. */
export function isoToZonedInputs(iso: string, tz: string): { date: string; time: string } {
  const p = regionParts(iso, tz);
  return { date: p.date, time: p.time };
}

/** «Суббота, 7 ноября, 19:00» / «сегодня, 19:00» — в поясе региона. */
export function formatSession(iso: string, tz: string, now: Date = new Date()): string {
  return formatDateTime(iso, "ru", todayIn(tz, now), tz);
}

/** «7 ноября 2026, 19:48» — для журналов и таблиц. */
export function formatStamp(iso: string, tz: string): string {
  const p = regionParts(iso, tz);
  return `${formatDate(p.date, "ru", { year: true })}, ${p.time}`;
}

/** «3 часа назад» по-русски. */
export function ago(iso: string, now: Date = new Date()): string {
  return relativeTime(iso, "ru", now);
}

export { todayIn };
