/**
 * «Пульс культуры»: производные показатели дашборда и описание таблиц для экрана и CSV-выгрузки.
 * Одна и та же таблица на экране и в файле — из одного описания колонок, чтобы цифры совпадали.
 */
import type { Dashboard, SourceRow } from "./admin-types";
import { REGION_TZ } from "./config";
import type { CsvColumn } from "./csv";
import { formatStamp } from "./datetime";
import { categoryLabel, taskKindLabel } from "./labels";

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(value: unknown): Period {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

/** Порог «культурной пустыни» в API: меньше 3 сеансов за период. */
export const DESERT_THRESHOLD = 3;

export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

const pct = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("ru-RU");

export function formatPercent(value: number | null): string {
  return value === null ? "—" : pct.format(value);
}

export function formatNumber(value: number): string {
  return num.format(value);
}

/** Запросы жителей показываются как текст: управляющие символы заменяются видимым знаком «�». */
export function printable(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: именно их и заменяем
  return s.replace(/[\u0000-\u001F\u007F-\u009F]/g, "\uFFFD").trim();
}

/** Коды категорий из API («theatre, kids») → «Театр, Детям». */
export function categoriesText(codes: string | null): string {
  if (!codes) return "любые";
  // API может повторять код, если запрос задавал категорию несколько раз — показываем каждую один раз.
  return [...new Set(codes.split(",").map((c) => c.trim()))].filter(Boolean).map(categoryLabel).join(", ");
}

/* ---------- Здоровье источников ---------- */

export type SourceHealthKind = "ok" | "stale" | "failing" | "manual";

export interface SourceHealth {
  kind: SourceHealthKind;
  label: string;
}

/** Синхронизация Культуры.РФ идёт каждые 6 часов: 12 ч без успеха — повод проверить, 36 ч — сбой. */
const STALE_MS = 12 * 3600_000;
const FAILING_MS = 36 * 3600_000;

export function sourceHealth(
  source: Pick<SourceRow, "last_success_at" | "last_stats">,
  now: Date = new Date(),
): SourceHealth {
  const stats = source.last_stats ?? {};
  const errors = Number(stats.errors ?? 0);
  if (!source.last_success_at) {
    return Object.keys(stats).length === 0
      ? { kind: "manual", label: "Ручной ввод, без автоматического сбора" }
      : { kind: "failing", label: "Ни одного успешного сбора" };
  }
  const age = now.getTime() - new Date(source.last_success_at).getTime();
  if (age > FAILING_MS) return { kind: "failing", label: "Сбор не работает больше суток" };
  if (age > STALE_MS) return { kind: "stale", label: "Давно не обновлялся" };
  if (errors > 0) return { kind: "stale", label: `Работает, есть ошибки: ${errors}` };
  return { kind: "ok", label: "Работает" };
}

/** Короткая сводка статистики последнего сбора. */
export function sourceStatsText(stats: Record<string, unknown> | null): string {
  if (!stats || Object.keys(stats).length === 0) return "—";
  const n = (k: string) => Number(stats[k] ?? 0);
  const parts = [
    `новых событий ${formatNumber(n("eventsNew"))}`,
    `обновлено ${formatNumber(n("eventsUpdated"))}`,
    `новых сеансов ${formatNumber(n("occurrencesNew"))}`,
  ];
  if (n("vanished")) parts.push(`исчезло ${formatNumber(n("vanished"))}`);
  if (n("errors")) parts.push(`ошибок ${formatNumber(n("errors"))}`);
  return parts.join(", ");
}

/* ---------- Таблицы для экрана и CSV ---------- */

type Row<K extends keyof Dashboard> = Dashboard[K] extends readonly (infer R)[] ? R : never;

export interface PulseTable<K extends keyof Dashboard = keyof Dashboard> {
  key: K;
  title: string;
  columns: CsvColumn<Row<K>>[];
}

const supply: PulseTable<"supply"> = {
  key: "supply",
  title: "Предложение по муниципалитетам",
  columns: [
    { header: "Муниципалитет", value: (r) => r.name },
    { header: "Тип", value: (r) => (r.kind === "city" ? "городской округ" : "муниципальный район") },
    { header: "Сеансов за период", value: (r) => r.upcoming },
    { header: "Бесплатных", value: (r) => r.free },
    { header: "По Пушкинской карте", value: (r) => r.pushkin },
    { header: "Для детей", value: (r) => r.kids },
  ],
};

const deserts: PulseTable<"culture_deserts"> = {
  key: "culture_deserts",
  title: "Культурные пустыни",
  columns: [
    { header: "Муниципалитет", value: (r) => r.name },
    { header: "Сеансов за период", value: (r) => r.upcoming },
  ],
};

const byCategory: PulseTable<"by_category"> = {
  key: "by_category",
  title: "Сеансы по категориям",
  columns: [
    { header: "Категория", value: (r) => categoryLabel(r.code) },
    { header: "Сеансов за период", value: (r) => r.n },
  ],
};

const demandTop: PulseTable<"demand_top"> = {
  key: "demand_top",
  title: "Топ запросов",
  columns: [
    { header: "Запрос", value: (r) => r.query },
    { header: "Сколько раз искали", value: (r) => r.n },
    { header: "Среднее число результатов", value: (r) => r.avg_results },
  ],
};

const gaps: PulseTable<"demand_without_supply"> = {
  key: "demand_without_supply",
  title: "Спрос без предложения",
  columns: [
    { header: "Где", value: (r) => r.municipality ?? "вся республика" },
    { header: "Что искали", value: (r) => categoriesText(r.categories) },
    { header: "С детьми", value: (r) => r.with_kids },
    { header: "Запросов без результата", value: (r) => r.n },
    { header: "Пример запроса", value: (r) => r.example },
  ],
};

const quality: PulseTable<"data_quality"> = {
  key: "data_quality",
  title: "Качество данных учреждений",
  columns: [
    { header: "Учреждение", value: (r) => r.name },
    { header: "Событий впереди", value: (r) => r.events },
    { header: "Индекс полноты (0–100)", value: (r) => r.avg_quality },
    { header: "Без фото", value: (r) => r.no_image },
    { header: "Без цены", value: (r) => r.no_price },
  ],
};

const sources: PulseTable<"sources"> = {
  key: "sources",
  title: "Здоровье источников",
  columns: [
    { header: "Источник", value: (r) => r.title },
    {
      header: "Последний успешный сбор (время региона)",
      value: (r) => (r.last_success_at ? formatStamp(r.last_success_at, REGION_TZ) : null),
    },
    { header: "Состояние", value: (r) => sourceHealth(r).label },
    { header: "Статистика сбора", value: (r) => sourceStatsText(r.last_stats) },
  ],
};

const moderation: PulseTable<"moderation"> = {
  key: "moderation",
  title: "Очереди модерации",
  columns: [
    { header: "Очередь", value: (r) => taskKindLabel(r.kind) },
    { header: "Открытых задач", value: (r) => r.open },
  ],
};

/** Таблицы, доступные для выгрузки: адрес /pulse/export/<slug>. */
export const PULSE_TABLES = {
  supply,
  deserts,
  categories: byCategory,
  queries: demandTop,
  "demand-gaps": gaps,
  quality,
  sources,
  moderation,
} as const;

export type PulseTableSlug = keyof typeof PULSE_TABLES;

export function isPulseTable(slug: string): slug is PulseTableSlug {
  return Object.hasOwn(PULSE_TABLES, slug);
}

export function tableRows(dashboard: Dashboard, slug: PulseTableSlug): readonly unknown[] {
  return dashboard[PULSE_TABLES[slug].key] as readonly unknown[];
}
