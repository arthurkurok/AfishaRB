/**
 * Выборка пар-кандидатов для оценки дедупликации на реальном каталоге РБ.
 * Требования — docs/06-data.md §5, методика разметки — docs/dedup-labeling.md.
 *
 * Пары берутся со стадии блокировки (тот же SQL, что в dedup/service.ts) до решения алгоритма, включая скрытые
 * (уже слитые) события. Выборка стратифицирована по score текущего скоринга, но разметчику ни score, ни страта,
 * ни решение алгоритма не показываются: он видит только бланк с парами в случайном порядке.
 *
 *   1. sample — выборка и бланк для слепой разметки:
 *        pnpm --filter @afisha/api exec tsx scripts/export-dedup-pairs.ts [sample] [--dir <каталог>] [--seed <число>]
 *      <каталог>/to-label.jsonl — бланк: пары в случайном порядке, без score, страты, доли и решения алгоритма;
 *      <каталог>/pairs.json     — признаки, страты, доли и веса (разметчику не открывать до конца разметки).
 *      Если пара уже размечена в фикстурах (совпал id пары), метка переносится в бланк.
 *   2. Разметчик заполняет в бланке поля label ("same" | "different" | "uncertain") и note.
 *   3. build — сборка фикстур из размеченного бланка:
 *        pnpm --filter @afisha/api exec tsx scripts/export-dedup-pairs.ts build [--dir <каталог>]
 *      → test/fixtures/dedup-pairs.jsonl (основная выборка) и test/fixtures/dedup-pairs-holdout.jsonl (отложенная).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client.js";
import { AUTO_MERGE, type PairFeatures, REVIEW, scorePair } from "../src/modules/dedup/scoring.js";

/** Страты по score и похожести названий. Пары с похожими названиями (title_sim ≥ 0,6) берутся все. */
const STRATA = [
  { id: "auto", label: "score ≥ 0,92", take: "all" },
  { id: "review", label: "0,70 ≤ score < 0,92", take: "all" },
  { id: "mid-sim", label: "0,50 ≤ score < 0,70, title_sim ≥ 0,6", take: "all" },
  { id: "mid", label: "0,50 ≤ score < 0,70, title_sim < 0,6", take: 150 },
  { id: "low-sim", label: "score < 0,50, title_sim ≥ 0,6", take: "all" },
  { id: "low", label: "score < 0,50, title_sim < 0,6", take: 170 },
] as const;
type StratumId = (typeof STRATA)[number]["id"];

const HOLDOUT_SHARE = 0.3;
const SIM_THRESHOLD = 0.6;
const FIXTURES = new URL("../test/fixtures/", import.meta.url);
const MAIN_FILE = new URL("dedup-pairs.jsonl", FIXTURES);
const HOLDOUT_FILE = new URL("dedup-pairs-holdout.jsonl", FIXTURES);

export type Label = "same" | "different" | "uncertain";
type Side = {
  title: string;
  summary: string;
  categories: string[];
  venue: string | null;
  address: string | null;
  org: string | null;
  starts: string;
  age: number | null;
  price: string;
};
type Context = { a: Side; b: Side };
type PairMeta = {
  id: string;
  stratum: StratumId;
  split: "main" | "holdout";
  weight: number;
  features: PairFeatures;
  context: Context;
};
type Sheet = {
  n: number;
  id: string;
  label: Label | null;
  note: string;
  minutesApart: number;
  sameVenue: boolean;
  distanceM: number | null;
  sameOrg: boolean;
  a: Side;
  b: Side;
};
export type FixturePair = {
  id: string;
  split: "main" | "holdout";
  stratum: StratumId;
  /** Вес пары для оценки на всех кандидатах: размер страты / число пар страты в этой части выборки. */
  weight: number;
  label: Label;
  /** true — одно событие, false — разные, null — сомнительная пара (в метрики не входит). */
  same: boolean | null;
  note: string;
  features: PairFeatures;
  context: Context;
};

type Row = {
  a: string;
  b: string;
  minutes_apart: number;
  same_venue: boolean | null;
  distance_m: number | null;
  starts_a: Date;
  starts_b: Date;
  venue_a: string | null;
  venue_b: string | null;
  address_a: string | null;
  address_b: string | null;
};
type EventRow = {
  id: string;
  title: string | null;
  summary: string | null;
  categories: string[];
  organization_id: string | null;
  org: string | null;
  age_rating: number | null;
  price_min: string | null;
  price_max: string | null;
  is_free: boolean;
};

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "sample";
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const dir = opt("dir") ?? join(tmpdir(), "afisha-dedup-labeling");
const seed = Number(opt("seed") ?? 102);

/** Детерминированный ГПСЧ (mulberry32), чтобы выборка воспроизводилась при том же состоянии БД. */
function rng(s: number) {
  let t = s >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function stratumOf(score: number, titleSim: number): StratumId {
  if (score >= AUTO_MERGE) return "auto";
  if (score >= REVIEW) return "review";
  if (score >= 0.5) return titleSim >= SIM_THRESHOLD ? "mid-sim" : "mid";
  return titleSim >= SIM_THRESHOLD ? "low-sim" : "low";
}

function readJsonl<T>(path: string | URL): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

async function sample() {
  const db = getDb();
  const tz =
    (await db.execute<{ timezone: string }>(sql`SELECT timezone FROM region WHERE id = 'ba'`)).rows[0]?.timezone ??
    "Asia/Yekaterinburg";
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Блокировка — как в dedup/service.ts; отличия: берутся и скрытые (уже слитые) события, cluster_id не фильтруется,
  // исключены тестовые события e2e. Для каждой пары событий — ближайшая по времени пара сеансов.
  const rows = (
    await db.execute<Row>(sql`
      SELECT DISTINCT ON (LEAST(o1.event_id, o2.event_id), GREATEST(o1.event_id, o2.event_id))
        o1.event_id AS a, o2.event_id AS b,
        abs(extract(epoch FROM (o1.starts_at - o2.starts_at))) / 60 AS minutes_apart,
        (o1.venue_id = o2.venue_id) AS same_venue,
        ST_Distance(v1.geo, v2.geo) AS distance_m,
        o1.starts_at AS starts_a, o2.starts_at AS starts_b,
        v1.name->>'ru' AS venue_a, v2.name->>'ru' AS venue_b, v1.address AS address_a, v2.address AS address_b
      FROM occurrence o1
      JOIN occurrence o2 ON o1.event_id < o2.event_id
        AND o2.starts_at BETWEEN o1.starts_at - interval '45 minutes' AND o1.starts_at + interval '45 minutes'
        AND o1.municipality_id IS NOT DISTINCT FROM o2.municipality_id
      JOIN event e1 ON e1.id = o1.event_id AND e1.moderation_status IN ('published', 'hidden')
      JOIN event e2 ON e2.id = o2.event_id AND e2.moderation_status IN ('published', 'hidden')
      LEFT JOIN venue v1 ON v1.id = o1.venue_id
      LEFT JOIN venue v2 ON v2.id = o2.venue_id
      WHERE o1.is_range = false AND o2.is_range = false
        AND o1.status <> 'ended' AND o2.status <> 'ended'
        AND (o1.venue_id = o2.venue_id OR ST_DWithin(v1.geo, v2.geo, 300))
        AND e1.title->>'ru' NOT LIKE '[e2e]%' AND e2.title->>'ru' NOT LIKE '[e2e]%'
      ORDER BY LEAST(o1.event_id, o2.event_id), GREATEST(o1.event_id, o2.event_id), minutes_apart`)
  ).rows;
  const ids = [...new Set(rows.flatMap((r) => [r.a, r.b]))];
  const events = new Map<string, EventRow>();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const res = await db.execute<EventRow>(sql`
      SELECT e.id, e.title->>'ru' AS title, e.summary->>'ru' AS summary, e.category_codes AS categories,
        e.organization_id, o.name->>'ru' AS org, e.age_rating, e.price_min, e.price_max, e.is_free
      FROM event e LEFT JOIN organization o ON o.id = e.organization_id
      WHERE e.id IN (${sql.join(
        chunk.map((x) => sql`${x}::uuid`),
        sql`, `,
      )})`);
    for (const e of res.rows) events.set(e.id, e);
  }

  const side = (e: EventRow, starts: Date, venue: string | null, address: string | null): Side => ({
    title: e.title ?? "",
    summary: (e.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 320),
    categories: e.categories,
    venue,
    address,
    org: e.org,
    starts: fmt.format(starts),
    age: e.age_rating,
    price: e.is_free
      ? "бесплатно"
      : e.price_min === null
        ? "—"
        : e.price_max !== null && Number(e.price_max) !== Number(e.price_min)
          ? `${Number(e.price_min)}–${Number(e.price_max)} ₽`
          : `${Number(e.price_min)} ₽`,
  });

  type Cand = { id: string; stratum: StratumId; features: PairFeatures; context: Context };
  const cands: Cand[] = [];
  for (const r of rows) {
    const a = events.get(r.a);
    const b = events.get(r.b);
    if (!a || !b) continue;
    // Признаки — ровно как в dedup/service.ts
    const features: PairFeatures = {
      titleA: a.title ?? "",
      titleB: b.title ?? "",
      minutesApart: Number(r.minutes_apart),
      sameVenue: Boolean(r.same_venue),
      distanceM: r.distance_m === null ? null : Math.round(Number(r.distance_m) * 10) / 10,
      sameOrg: a.organization_id !== null && a.organization_id === b.organization_id,
      ageA: a.age_rating,
      ageB: b.age_rating,
      priceA: a.price_min === null ? null : Number(a.price_min),
      priceB: b.price_min === null ? null : Number(b.price_min),
    };
    const sc = scorePair(features);
    cands.push({
      id: `${r.a}:${r.b}`,
      stratum: stratumOf(sc.score, sc.titleSim),
      features,
      context: {
        a: side(a, new Date(r.starts_a), r.venue_a, r.address_a),
        b: side(b, new Date(r.starts_b), r.venue_b, r.address_b),
      },
    });
  }
  cands.sort((x, y) => (x.id < y.id ? -1 : 1));

  const rand = rng(seed);
  const metas: PairMeta[] = [];
  const summary: Record<string, { population: number; sampled: number; main: number; holdout: number }> = {};
  for (const s of STRATA) {
    const pool = cands.filter((c) => c.stratum === s.id);
    const picked = shuffle(pool, rand).slice(0, s.take === "all" ? pool.length : s.take);
    const nHoldout = Math.round(picked.length * HOLDOUT_SHARE);
    const nMain = picked.length - nHoldout;
    picked.forEach((c, i) => {
      const split = i < nHoldout ? "holdout" : "main";
      metas.push({ ...c, split, weight: pool.length / (split === "holdout" ? nHoldout : nMain) });
    });
    summary[s.id] = { population: pool.length, sampled: picked.length, main: nMain, holdout: nHoldout };
  }

  // Метки уже размеченных пар переносятся из фикстур: повторная выгрузка не требует повторной разметки
  const known = new Map(
    [...readJsonl<FixturePair>(MAIN_FILE), ...readJsonl<FixturePair>(HOLDOUT_FILE)]
      .filter((p) => p.id)
      .map((p) => [p.id, p]),
  );
  const sheet: Sheet[] = shuffle(metas, rand).map((m, i) => ({
    n: i + 1,
    id: m.id,
    label: known.get(m.id)?.label ?? null,
    note: known.get(m.id)?.note ?? "",
    minutesApart: Math.round(m.features.minutesApart),
    sameVenue: m.features.sameVenue,
    distanceM: m.features.distanceM === null ? null : Math.round(m.features.distanceM),
    sameOrg: m.features.sameOrg,
    a: m.context.a,
    b: m.context.b,
  }));

  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "pairs.json"),
    JSON.stringify({ seed, candidates: cands.length, strata: summary, pairs: metas }, null, 1),
  );
  writeFileSync(join(dir, "to-label.jsonl"), `${sheet.map((s) => JSON.stringify(s)).join("\n")}\n`);
  console.log(`кандидатов после блокировки: ${cands.length}, в выборке: ${metas.length}`);
  console.table(
    STRATA.map((s) => ({ страта: s.id, условие: s.label, ...summary[s.id] })),
    ["страта", "условие", "population", "sampled", "main", "holdout"],
  );
  console.log(`уже размечено (перенесено из фикстур): ${sheet.filter((s) => s.label).length}`);
  console.log(`бланк для разметки: ${join(dir, "to-label.jsonl")}`);
  await closeDb();
}

function build() {
  const meta = JSON.parse(readFileSync(join(dir, "pairs.json"), "utf8")) as { pairs: PairMeta[] };
  const labels = new Map(readJsonl<Sheet>(join(dir, "to-label.jsonl")).map((s) => [s.id, s]));
  const missing = meta.pairs.filter((p) => !labels.get(p.id)?.label);
  if (missing.length > 0) throw new Error(`не размечено пар: ${missing.length} (например, ${missing[0]?.id})`);
  const out: FixturePair[] = meta.pairs.map((p) => {
    const s = labels.get(p.id)!;
    const label = s.label!;
    if (!["same", "different", "uncertain"].includes(label)) throw new Error(`неизвестная метка ${label} у ${p.id}`);
    if (label !== "same" && !s.note.trim()) throw new Error(`нет обоснования для метки ${label} у ${p.id}`);
    return {
      id: p.id,
      split: p.split,
      stratum: p.stratum,
      weight: Math.round(p.weight * 1000) / 1000,
      label,
      same: label === "uncertain" ? null : label === "same",
      note: s.note.trim(),
      features: p.features,
      context: p.context,
    };
  });
  const write = (file: URL, split: "main" | "holdout") => {
    const part = out.filter((p) => p.split === split);
    writeFileSync(file, `${part.map((p) => JSON.stringify(p)).join("\n")}\n`);
    const count = (l: Label) => part.filter((p) => p.label === l).length;
    console.log(
      `${split}: ${part.length} пар (same ${count("same")}, different ${count("different")}, uncertain ${count("uncertain")})`,
    );
  };
  write(MAIN_FILE, "main");
  write(HOLDOUT_FILE, "holdout");
}

if (command === "sample") await sample();
else if (command === "build") build();
else throw new Error(`неизвестная команда ${command}: sample | build`);
