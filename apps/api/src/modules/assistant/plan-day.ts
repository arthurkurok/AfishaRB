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

export type PlanOptions = {
  /** Сколько остановок нужно (по умолчанию 3). */
  maxStops?: number;
  /** Бюджет на всю компанию за весь маршрут, ₽ (null — без ограничения). */
  budgetTotal?: number | null;
  /** Сколько человек идёт: стоимость остановки = минимальная цена билета × people. */
  people?: number;
  /** «Без долгих переездов»: дорога между соседними остановками не дольше, мин. */
  maxTravelMin?: number | null;
};

/** Почему кандидаты не вошли в маршрут — для честного объяснения «что мешает». */
export type PlanSkips = { overlap: number; budget: number; unknownPrice: number; travel: number };

/** Стоимость остановки на всю компанию: бесплатно — 0, цена неизвестна — null. */
export function stopCost(c: OccurrenceCard, people = 1): number | null {
  if (c.event.price.is_free) return 0;
  const min = c.event.price.min;
  if (min === null || min === undefined) return null;
  return Math.round(Number(min)) * Math.max(1, people);
}

/** Жадный выбор по времени начала с запретом пересечений и бонусом за разнообразие категорий. */
export function planDay(candidates: OccurrenceCard[], opts: number | PlanOptions = 3): PlanStop[] {
  return planDayDetailed(candidates, typeof opts === "number" ? { maxStops: opts } : opts).stops;
}

/** Местное время «HH:MM» того же дня, что и начало карточки (смещение региона — из starts_at, RFC 3339). */
function sameDayAt(c: OccurrenceCard, hhmm: string): number {
  const offset = c.starts_at.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ?? "Z";
  return new Date(`${c.starts_at.slice(0, 10)}T${hhmm}:00${offset}`).getTime();
}
/** Выставку-интервал («весь день с 00:00 до 23:59») ставим в маршрут не раньше 10:00. */
const RANGE_VISIT_FROM = "10:00";
/** Сеансы с точным временем раньше 07:00 («00:00» — артефакт источника или ночной показ) в план дня не берём. */
const EARLIEST_SESSION = "07:00";

export function planDayDetailed(
  candidates: OccurrenceCard[],
  opts: PlanOptions = {},
): { stops: PlanStop[]; skips: PlanSkips; total: number | null } {
  const maxStops = opts.maxStops ?? 3;
  const people = Math.max(1, opts.people ?? 1);
  const budget = opts.budgetTotal ?? null;
  const skips: PlanSkips = { overlap: 0, budget: 0, unknownPrice: 0, travel: 0 };
  const live = candidates.filter((c) => c.status === "scheduled");
  // сначала сеансы с точным временем (спектакль в 12:00): у них интервал короткий и честный;
  // выставки-интервалы («с 9 до 18») добавляем потом — только в свободное окно между ними
  const byStart = (a: OccurrenceCard, b: OccurrenceCard) => a.starts_at.localeCompare(b.starts_at);
  const fixed = live
    .filter((c) => !c.is_range && new Date(c.starts_at).getTime() >= sameDayAt(c, EARLIEST_SESSION))
    .sort(byStart);
  const ranges = live.filter((c) => c.is_range).sort(byStart);
  const plan: PlanStop[] = [];
  const usedCats = new Set<string>();
  let spent = 0;
  let unknownInPlan = false;
  const mainCat = (c: OccurrenceCard) => c.event.categories.find((x) => x !== "kids") ?? c.event.categories[0] ?? "";
  const clear = (c: OccurrenceCard, start: number, end: number) =>
    plan.every((p) => {
      const travel = travelMinutes(p.card, c);
      return start >= p.end.getTime() + travel * 60_000 || end + travel * 60_000 <= p.start.getTime();
    });
  /** Соседи по времени — для оценки дороги и ограничения «без долгих переездов». */
  const neighbours = (start: number) => ({
    prev: plan.filter((p) => p.start.getTime() <= start).at(-1),
    next: plan.find((p) => p.start.getTime() > start),
  });
  /** Бюджет и цена: null — остановку взять можно, иначе — причина отказа. */
  const costCheck = (c: OccurrenceCard): { ok: true; cost: number | null } | { ok: false } => {
    const cost = stopCost(c, people);
    if (budget === null) return { ok: true, cost };
    if (cost === null) {
      skips.unknownPrice++;
      return { ok: false };
    }
    if (spent + cost > budget) {
      skips.budget++;
      return { ok: false };
    }
    return { ok: true, cost };
  };
  const take = (c: OccurrenceCard, start: number, end: number, cost: number | null) => {
    plan.push({ card: c, start: new Date(start), end: new Date(end), travelMin: 0 });
    plan.sort((a, b) => a.start.getTime() - b.start.getTime());
    usedCats.add(mainCat(c));
    if (cost === null) unknownInPlan = true;
    else spent += cost;
  };
  const tooFar = (c: OccurrenceCard, start: number) => {
    if (!opts.maxTravelMin) return false;
    const { prev, next } = neighbours(start);
    return [prev, next].some((p) => p && travelMinutes(p.card, c) > opts.maxTravelMin!);
  };

  for (const c of fixed) {
    if (plan.length >= maxStops) break;
    if (plan.some((p) => p.card.event.id === c.event.id)) continue;
    const w = window(c);
    // пересечение с ЛЮБОЙ уже взятой остановкой (не только последней) — сырое окно сеанса
    if (!clear(c, w.start.getTime(), w.end.getTime())) {
      skips.overlap++;
      continue;
    }
    if (tooFar(c, w.start.getTime())) {
      skips.travel++;
      continue;
    }
    // Разнообразие: вторую остановку той же категории берём, только если других вариантов позже нет
    if (
      usedCats.has(mainCat(c)) &&
      fixed.some((o) => o !== c && o.starts_at > c.starts_at && !usedCats.has(mainCat(o)))
    )
      continue;
    const cc = costCheck(c);
    if (!cc.ok) continue;
    take(c, w.start.getTime(), w.end.getTime(), cc.cost);
  }

  // Выставки и экспозиции — в первое свободное окно своего интервала (не раньше 10:00)
  for (const c of ranges) {
    if (plan.length >= maxStops) break;
    if (plan.some((p) => p.card.event.id === c.event.id)) continue;
    const from = Math.max(new Date(c.starts_at).getTime(), sameDayAt(c, RANGE_VISIT_FROM));
    const until = c.ends_at ? new Date(c.ends_at).getTime() : sameDayAt(c, "20:00");
    // время визита округляем до четверти часа: «12:15», а не «12:02»
    const quarter = (t: number) => Math.ceil(t / 900_000) * 900_000;
    const slots = [from, ...plan.map((p) => p.end.getTime() + travelMinutes(p.card, c) * 60_000)]
      .map(quarter)
      .filter((t) => t >= from && t + EXPO_VISIT_MIN * 60_000 <= until)
      .sort((a, b) => a - b);
    const at = slots.find((t) => clear(c, t, t + EXPO_VISIT_MIN * 60_000));
    if (at === undefined) {
      skips.overlap++;
      continue;
    }
    if (tooFar(c, at)) {
      skips.travel++;
      continue;
    }
    if (usedCats.has(mainCat(c)) && ranges.some((o) => o !== c && !usedCats.has(mainCat(o)))) continue;
    const cc = costCheck(c);
    if (!cc.ok) continue;
    take(c, at, at + EXPO_VISIT_MIN * 60_000, cc.cost);
  }

  // Дорога — от предыдущей по времени остановки
  for (let i = 0; i < plan.length; i++)
    plan[i]!.travelMin = i === 0 ? 0 : travelMinutes(plan[i - 1]!.card, plan[i]!.card);
  return { stops: plan, skips, total: unknownInPlan ? null : spent };
}
