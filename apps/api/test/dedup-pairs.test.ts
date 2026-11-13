/**
 * Качество дедупликации на парах-кандидатах реального каталога РБ, размеченных вслепую (docs/dedup-labeling.md).
 * Пары взяты со стадии блокировки до решения алгоритма и стратифицированы по score; ~30 % отложены
 * (test/fixtures/dedup-pairs-holdout.jsonl) и для подстройки скоринга не используются.
 *
 * Пороги docs/06-data.md §5.2, проверяются на основной и на отложенной выборке:
 * - precision автослияния ≥ 0,99 — на текущем объёме это 0 ложных автослияний;
 * - recall с учётом очереди ≥ 0,95 — и на самой выборке, и в оценке на всех кандидатах (с весами страт);
 * - доля пар в очереди ≤ 10 % кандидатов — оценка на всех кандидатах (с весами страт).
 * Сомнительные пары (label = "uncertain") хранятся в фикстурах, но в метрики не входят.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decide, type PairFeatures, scorePair } from "../src/modules/dedup/scoring.js";

type Pair = {
  id: string;
  split: "main" | "holdout";
  stratum: string;
  weight: number;
  label: "same" | "different" | "uncertain";
  same: boolean | null;
  note: string;
  features: PairFeatures;
};

const MIN_PRECISION = 0.99;
const MIN_RECALL = 0.95;
const MAX_QUEUE_SHARE = 0.1;

const load = (file: string): Pair[] =>
  readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Pair);

const SPLITS = {
  "основная выборка": load("dedup-pairs.jsonl"),
  "отложенная выборка": load("dedup-pairs-holdout.jsonl"),
};

function evaluate(pairs: Pair[]) {
  const rows = pairs.map((p) => {
    const sc = scorePair(p.features);
    return { ...p, score: sc.score, decision: decide(sc.score) };
  });
  const labeled = rows.filter((r) => r.same !== null);
  const positives = labeled.filter((r) => r.same);
  const merged = labeled.filter((r) => r.decision === "merge");
  const sum = (xs: typeof rows) => xs.reduce((s, r) => s + r.weight, 0);
  const ratio = (a: number, b: number) => (b === 0 ? Number.NaN : a / b);
  const caught = positives.filter((r) => r.decision !== "distinct");
  return {
    rows,
    labeled: labeled.length,
    uncertain: rows.length - labeled.length,
    positives: positives.length,
    merges: merged.length,
    falseMerges: merged.filter((r) => !r.same),
    missed: positives.filter((r) => r.decision === "distinct"),
    uncertainMerged: rows.filter((r) => r.same === null && r.decision === "merge"),
    precisionAuto: ratio(merged.filter((r) => r.same).length, merged.length),
    recallAuto: ratio(positives.filter((r) => r.decision === "merge").length, positives.length),
    recallWithQueue: ratio(caught.length, positives.length),
    // Оценки на всех кандидатах блокировки: каждая пара весит «размер страты / пар страты в выборке»
    recallWithQueueAll: ratio(sum(caught), sum(positives)),
    queueShareSample: ratio(rows.filter((r) => r.decision === "review").length, rows.length),
    queueShareAll: ratio(sum(rows.filter((r) => r.decision === "review")), sum(rows)),
    candidatesAll: Math.round(sum(rows)),
  };
}

const describePair = (r: { features: PairFeatures; score: number; decision: string; note: string }) =>
  `«${r.features.titleA}» / «${r.features.titleB}» — score ${r.score}, ${r.decision}${r.note ? ` (${r.note})` : ""}`;

const results = Object.fromEntries(Object.entries(SPLITS).map(([name, pairs]) => [name, evaluate(pairs)]));

const pct = (x: number) => (Number.isNaN(x) ? "—" : x.toFixed(3));
console.log(
  [
    "Дедупликация на размеченных парах (docs/06-data.md §5.2)",
    ...Object.entries(results).map(([name, m]) =>
      [
        `• ${name}: ${m.rows.length} пар, в метриках ${m.labeled} (дублей ${m.positives}), сомнительных ${m.uncertain}`,
        `  precision автослияния ${pct(m.precisionAuto)} (${m.merges - m.falseMerges.length}/${m.merges}, порог ${MIN_PRECISION})`,
        `  recall автослияния ${pct(m.recallAuto)}`,
        `  recall с очередью ${pct(m.recallWithQueue)} на выборке, ${pct(m.recallWithQueueAll)} на всех кандидатах (порог ${MIN_RECALL})`,
        `  доля очереди ${pct(m.queueShareAll)} на всех ≈${m.candidatesAll} кандидатах, ${pct(m.queueShareSample)} на выборке (порог ${MAX_QUEUE_SHARE})`,
        ...m.falseMerges.map((r) => `  ✗ ложное автослияние: ${describePair(r)}`),
        ...m.missed.map((r) => `  ✗ пропущенный дубль: ${describePair(r)}`),
        ...m.uncertainMerged.map((r) => `  ? автослияние сомнительной пары: ${describePair(r)}`),
      ].join("\n"),
    ),
  ].join("\n"),
);

describe.each(Object.keys(SPLITS))("дедупликация на размеченных парах: %s", (name) => {
  const m = results[name]!;

  it("ни одного ложного автослияния", () => {
    expect(m.falseMerges.map(describePair)).toEqual([]);
  });

  it(`recall с учётом очереди ≥ ${MIN_RECALL} на выборке`, () => {
    expect(m.missed.map(describePair)).toEqual([]);
    expect(m.recallWithQueue).toBeGreaterThanOrEqual(MIN_RECALL);
  });

  it(`recall с учётом очереди ≥ ${MIN_RECALL} в оценке на всех кандидатах`, () => {
    expect(m.recallWithQueueAll).toBeGreaterThanOrEqual(MIN_RECALL);
  });

  it(`доля очереди ≤ ${MAX_QUEUE_SHARE} кандидатов`, () => {
    expect(m.queueShareAll).toBeLessThanOrEqual(MAX_QUEUE_SHARE);
  });
});

describe("набор пар не вырожден", () => {
  const all = Object.values(SPLITS).flat();

  it("≥ 360 пар со стадии блокировки, около 30 % — в отложенной выборке", () => {
    expect(all.length).toBeGreaterThanOrEqual(360);
    const holdoutShare = SPLITS["отложенная выборка"].length / all.length;
    expect(holdoutShare).toBeGreaterThan(0.25);
    expect(holdoutShare).toBeLessThan(0.35);
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
  });

  it("каждая страта score есть в обеих частях, включая пары со score < 0,70", () => {
    for (const pairs of Object.values(SPLITS)) {
      expect(new Set(pairs.map((p) => p.stratum))).toEqual(
        new Set(["auto", "review", "mid-sim", "mid", "low-sim", "low"]),
      );
    }
    expect(all.filter((p) => scorePair(p.features).score < 0.7).length).toBeGreaterThan(200);
  });

  it("в каждой части есть и дубли, и разные; у каждой метки кроме same есть обоснование", () => {
    for (const pairs of Object.values(SPLITS)) {
      expect(pairs.filter((p) => p.same === true).length).toBeGreaterThanOrEqual(10);
      expect(pairs.filter((p) => p.same === false).length).toBeGreaterThanOrEqual(100);
    }
    expect(all.filter((p) => p.label !== "same" && !p.note)).toEqual([]);
  });
});
