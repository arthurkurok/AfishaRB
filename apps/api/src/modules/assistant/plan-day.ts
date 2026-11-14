/**
 * «Спланируй мне день» (docs/05-ai-agent.md §2.9): маршрут из 2–3 реальных событий одного дня.
 * Детерминированный алгоритм: события не пересекаются по времени, между ними остаётся время на дорогу
 * (15 мин + 3 мин/км по прямой), предпочитаются разные категории, «утро → день → вечер».
 */
import type { OccurrenceCard } from "@afisha/contract";

const DEFAULT_DURATION_MIN = 90;
/** Визит на выставку-интервал: осматриваем ~90 минут от начала окна («с 9 до 18» — не весь день). */
const EXPO_VISIT_MIN = 90;
/** Верхняя оценка визита: «сеанс-окно» (9:00–15:00 без is_range) не занимает день целиком. */
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
  const cap = start.getTime() + MAX_VISIT_MIN * 60_000;
  // «с 9 до 18» — это окно работы, а не длительность визита: маршрут резервирует
  // ~90 минут осмотра; даже сеанс-окно без is_range не съедает день — визит ≤ 150 минут
  const end = c.is_range
    ? new Date(start.getTime() + EXPO_VISIT_MIN * 60_000)
    : c.ends_at
      ? new Date(Math.min(new Date(c.ends_at).getTime(), cap))
      : new Date(start.getTime() + DEFAULT_DURATION_MIN * 60_000);
  return { start, end };
}

/** Жадный выбор по времени начала с запретом пересечений и бонусом за разнообразие категорий. */
export function planDay(candidates: OccurrenceCard[], maxStops = 3): PlanStop[] {
  const live = candidates.filter((c) => c.status === "scheduled");
  // сначала сеансы с точным временем (спектакль в 12:00): у них интервал короткий и честный;
  // выставки-интервалы («с 9 до 18») пытаемся добавить потом — только в свободное окно
  const pool = [...live.filter((c) => !c.is_range), ...live.filter((c) => c.is_range)].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at),
  );
  const plan: PlanStop[] = [];
  const usedCats = new Set<string>();
  for (const c of pool) {
    if (plan.length >= maxStops) break;
    if (plan.some((p) => p.card.event.id === c.event.id)) continue;
    const w = window(c);
    // пересечение с ЛЮБОЙ уже взятой остановкой (не только последней) — сырое окно сеанса
    const fits = plan.every((p) => {
      const travel = travelMinutes(p.card, c);
      return (
        w.start.getTime() >= p.end.getTime() + travel * 60_000 || w.end.getTime() + travel * 60_000 <= p.start.getTime()
      );
    });
    if (!fits) continue;
    const prev = plan.at(-1);
    const travel = prev ? travelMinutes(prev.card, c) : 0;
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
