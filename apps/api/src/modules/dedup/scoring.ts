/** Скоринг пар событий-кандидатов в дубли (docs/06-data.md §5). Чистые функции, покрыты тестами. */
import * as fuzz from "fuzzball";

export const AUTO_MERGE = 0.92;
/** Порог очереди модерации: 0,64 — сокращённые и перефразированные названия попадают к человеку (recall с очередью ≥ 0,95 на разметке). */
export const REVIEW = 0.64;

const STOP_WORDS =
  /(^|\s)(спектакль|концерт|премьера|выставка|мастер-класс|мастер класс|показ|фильм|лекция|встреча|мероприятие|программа|вечер|праздник|фестиваль|экскурсия)(?=\s|$)/g;
const AGE_MARK = /\b\d{1,2}\s*\+/g;
const QUOTED = /[«"“]([^»"”]{2,})[»"”]/;
const TYPE_GROUPS: [string, string][] = [
  ["выставк", "exhibit"],
  ["экспозици", "exhibit"],
  ["экскурси", "tour"],
  ["лекци", "talk"],
  ["беседа", "talk"],
  ["встреча", "talk"],
  ["мастер-класс", "workshop"],
  ["мастер класс", "workshop"],
  ["практикум", "workshop"],
  ["кружок", "workshop"],
  ["спектакл", "show"],
  ["постановк", "show"],
  ["концерт", "music"],
  ["программа", "music"],
  ["кинопоказ", "film"],
  ["фильм", "film"],
];

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(AGE_MARK, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(STOP_WORDS, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function quotedName(title: string): string | null {
  const m = title.match(QUOTED);
  return m?.[1] ? normalizeTitle(m[1]) : null;
}

export function eventType(title: string): string | null {
  const low = title.toLowerCase();
  let best: [number, string] | null = null;
  for (const [stem, group] of TYPE_GROUPS) {
    const pos = low.indexOf(stem);
    if (pos !== -1 && (best === null || pos < best[0])) best = [pos, group];
  }
  return best?.[1] ?? null;
}

export type PairFeatures = {
  titleA: string;
  titleB: string;
  minutesApart: number;
  sameVenue: boolean;
  distanceM: number | null;
  sameOrg: boolean;
  ageA: number | null;
  ageB: number | null;
  priceA: number | null;
  priceB: number | null;
};

export type PairScore = { score: number; titleSim: number; reasons: string[] };

const sim = (a: string, b: string) => Math.max(fuzz.token_set_ratio(a, b), fuzz.ratio(a, b)) / 100;

export function scorePair(f: PairFeatures): PairScore {
  const a = normalizeTitle(f.titleA);
  const b = normalizeTitle(f.titleB);
  const titleSim = a && b ? sim(a, b) : fuzz.token_set_ratio(f.titleA.toLowerCase(), f.titleB.toLowerCase()) / 100;
  const reasons = [`название ${titleSim.toFixed(2)}`];
  let score = 0.62 * titleSim;
  if (f.sameVenue) {
    score += 0.18;
    reasons.push("та же площадка");
  } else if (f.distanceM !== null && f.distanceM <= 300) {
    score += 0.12;
    reasons.push(`площадки в ${Math.round(f.distanceM)} м`);
  }
  score += 0.12 * Math.max(0, 1 - f.minutesApart / 45);
  if (f.minutesApart === 0) reasons.push("то же время");
  if (f.sameOrg) {
    score += 0.05;
    reasons.push("тот же организатор");
  }
  if (f.ageA !== null && f.ageB !== null && f.ageA !== f.ageB) {
    score -= 0.06;
    reasons.push("разный возраст");
  }
  if (f.priceA && f.priceB && f.priceA > 0 && f.priceB > 0) {
    if (Math.min(f.priceA, f.priceB) / Math.max(f.priceA, f.priceB) < 0.5) {
      score -= 0.05;
      reasons.push("сильно разные цены");
    }
  }
  const qa = quotedName(f.titleA);
  const qb = quotedName(f.titleB);
  if (qa && qb) {
    // Для названий в кавычках — строгие метрики: token_set даёт 100, если одно название — подмножество другого
    const nameSim = Math.max(fuzz.ratio(qa, qb), fuzz.token_sort_ratio(qa, qb)) / 100;
    if (nameSim < 0.8) {
      const tokens = (s: string) => new Set(s.split(/\s+/));
      const subset = [...tokens(qa)].every((t) => tokens(qb).has(t)) || [...tokens(qb)].every((t) => tokens(qa).has(t));
      if (subset) {
        // Сокращённое название («Для самой любимой на свете» → «Для самой любимой») — вероятный дубль:
        // отправляем в очередь модерации, но не автосливаем
        reasons.push(`название сокращено (${nameSim.toFixed(2)})`);
        score = Math.min(score, AUTO_MERGE - 0.01);
      } else {
        reasons.push(`разные названия в кавычках (${nameSim.toFixed(2)})`);
        score = Math.min(score, REVIEW - 0.01);
      }
    }
  }
  const ta = eventType(f.titleA);
  const tb = eventType(f.titleB);
  if (ta && tb && ta !== tb && !(new Set([ta, tb]).has("music") && new Set([ta, tb]).has("show"))) {
    reasons.push(`разный тип события (${ta} / ${tb})`);
    // 0,97 − 0,36 = 0,61 < REVIEW: выставка и экскурсия по ней — разные события, не тратим время модератора
    score -= 0.36;
  }
  // Разные числа в названии («30 минут» / «60 минут», «часть 1» / «часть 2») — разные события
  const nums = (x: string) => (x.replace(AGE_MARK, " ").match(/\d+/g) ?? []).join(",");
  if (nums(f.titleA) !== nums(f.titleB)) {
    reasons.push("разные числа в названии");
    score = Math.min(score, REVIEW - 0.01);
  }
  // Защита от слияния разных произведений на одной площадке в одно время
  if (titleSim < 0.6) score = Math.min(score, REVIEW - 0.01);
  return {
    score: Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000,
    titleSim: Math.round(titleSim * 1000) / 1000,
    reasons,
  };
}

export function decide(score: number): "merge" | "review" | "distinct" {
  if (score >= AUTO_MERGE) return "merge";
  if (score >= REVIEW) return "review";
  return "distinct";
}
