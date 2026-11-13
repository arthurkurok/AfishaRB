/**
 * «Спланируй мне день» (docs/05-ai-agent.md §2.9): маршрут из 2–3 реальных событий одного дня.
 * Детерминированный алгоритм: события не пересекаются по времени, между ними остаётся время на дорогу
 * (15 мин + 3 мин/км по прямой), предпочитаются разные категории, «утро → день → вечер».
 */
import type { OccurrenceCard } from "@afisha/contract";

const DEFAULT_DURATION_MIN = 90;
const MAX_VISIT_MIN = 150;

export type PlanStop = { card: OccurrenceCard; start: Date; end: Date; travelMin: number };

function distanceKm(a: OccurrenceCard, b: OccurrenceCard): number | null {
  const ga = a.venue?.geo;
  const gb = b.venue?.geo;
  if (!ga || !gb) return null;
  const R = 6371;
  const dLat = ((gb[0] - ga[0]) * Math.PI) / 180;
  const dLon = ((gb[1] - ga[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((ga[0] * Math.PI) / 180) * Math.cos((gb[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const travelMinutes = (a: OccurrenceCard, b: OccurrenceCard) => {
  const km = distanceKm(a, b);
  return km === null ? 30 : Math.round(15 + 3 * km);
};

function window(c: OccurrenceCard): { start: Date; end: Date } {
  const start = new Date(c.starts_at);
  if (c.is_range) {
    // Выставка заявлена интервалом «с 9 до 18»: интервал считается занятым целиком —
    // честно не вписывать между ней другое событие
    return { start, end: c.ends_at ? new Date(c.ends_at) : new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000) };
  }
  const rawEnd =
    c.ends_at && !c.is_range ? new Date(c.ends_at) : new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
  const end = new Date(Math.min(rawEnd.getTime(), start.getTime() + MAX_VISIT_MIN * 60_000));
  return { start, end };
}

/** Жадный выбор по времени начала с запретом пересечений и бонусом за разнообразие категорий. */
export function planDay(candidates: OccurrenceCard[], maxStops = 3): PlanStop[] {
  const pool = candidates
    .filter((c) => c.status === "scheduled")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const plan: PlanStop[] = [];
  const usedCats = new Set<string>();
  for (const c of pool) {
    if (plan.length >= maxStops) break;
    if (plan.some((p) => p.card.event.id === c.event.id)) continue;
    const w = window(c);
    const prev = plan.at(-1);
    const travel = prev ? travelMinutes(prev.card, c) : 0;
    if (prev && w.start.getTime() < prev.end.getTime() + travel * 60_000) continue;
    const mainCat = c.event.categories.find((x) => x !== "kids") ?? c.event.categories[0] ?? "";
    // Разнообразие: вторую остановку той же категории берём, только если других вариантов позже нет
    if (
      usedCats.has(mainCat) &&
      pool.some((o) => o !== c && o.starts_at > c.starts_at && !usedCats.has(o.event.categories[0] ?? ""))
    )
      continue;
    plan.push({ card: c, start: w.start, end: w.end, travelMin: travel });
    usedCats.add(mainCat);
  }
  return plan;
}
