/** Разрешение периода поиска в часовом поясе региона. */
import { addDays, type LocalDate, localParts, startOfLocalDay, todayLocal, weekdayOf } from "../geo/index.js";

export type When = "today" | "tomorrow" | "weekend" | "week" | "month";
export type DateWindow = { from: LocalDate; to: LocalDate; startUtc: Date; endUtc: Date };

/** Ближайшие выходные. В пятницу после 18:00 и в субботу — эти; в воскресенье после 18:00 — следующие. */
export function weekendRange(now: Date): [LocalDate, LocalDate] {
  const p = localParts(now);
  const today = p.date;
  const wd = weekdayOf(today);
  if (wd === 6) return [today, addDays(today, 1)];
  if (wd === 7) return p.hour >= 18 ? [addDays(today, 6), addDays(today, 7)] : [today, today];
  return [addDays(today, 6 - wd), addDays(today, 7 - wd)];
}

export function resolveWindow(
  opts: { when?: When; date_from?: string; date_to?: string },
  now: Date = new Date(),
  defaultDays = 30,
): DateWindow {
  const today = todayLocal(now);
  let from: LocalDate = today;
  let to: LocalDate = addDays(today, defaultDays);
  switch (opts.when) {
    case "today":
      to = today;
      break;
    case "tomorrow":
      from = to = addDays(today, 1);
      break;
    case "weekend":
      [from, to] = weekendRange(now);
      break;
    case "week":
      to = addDays(today, 6);
      break;
    case "month":
      to = addDays(today, 30);
      break;
    default:
      break;
  }
  if (opts.date_from && /^\d{4}-\d{2}-\d{2}$/.test(opts.date_from)) from = opts.date_from;
  if (opts.date_to && /^\d{4}-\d{2}-\d{2}$/.test(opts.date_to)) to = opts.date_to;
  if (to < from) to = from;
  // Сегодняшние события, которые уже закончились, не показываем: нижняя граница — «сейчас минус час»
  const dayStart = startOfLocalDay(from);
  const startUtc = from === today ? new Date(Math.max(dayStart.getTime(), now.getTime() - 3600_000)) : dayStart;
  return { from, to, startUtc, endUtc: startOfLocalDay(addDays(to, 1)) };
}

/** Максимальный допустимый возрастной знак для ребёнка данного возраста (436-ФЗ). */
export function maxRatingForChild(age: number): number {
  if (age >= 16) return 16;
  if (age >= 12) return 12;
  if (age >= 6) return 6;
  return 0;
}
