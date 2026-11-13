import type { OccurrenceCard } from "@afisha/contract";
import { regionParts } from "@afisha/i18n";

export interface DayGroup {
  /** YYYY-MM-DD в поясе региона */
  date: string;
  items: OccurrenceCard[];
}

/**
 * Группирует ленту (отсортированную по дате) по дням в поясе региона.
 * Длительные события, начавшиеся раньше первого дня выдачи, попадают в первый день — они идут и сегодня.
 */
export function groupByDay(items: OccurrenceCard[], tz: string, firstDay?: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    let date = regionParts(item.starts_at, tz).date;
    if (firstDay && date < firstDay) date = firstDay;
    const last = groups.at(-1);
    if (last && last.date === date) last.items.push(item);
    else {
      const existing = groups.find((g) => g.date === date);
      if (existing) existing.items.push(item);
      else groups.push({ date, items: [item] });
    }
  }
  return groups.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Склеивает страницы выдачи, убирая повторы (курсорная пагинация при изменении данных). */
export function mergePages(prev: OccurrenceCard[], next: OccurrenceCard[]): OccurrenceCard[] {
  const seen = new Set(prev.map((i) => i.id));
  return [...prev, ...next.filter((i) => !seen.has(i.id))];
}
