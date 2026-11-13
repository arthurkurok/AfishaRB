/**
 * Данные кабинета учреждения: ближайшие сеансы (все статусы), индекс полноты и подсказки.
 * Индекс — из «Пульса культуры» (dashboard.data_quality), если учреждение там есть; иначе — средний
 * quality_score по паспортам ближайших событий. Подсказки — по паспортам событий (что именно не заполнено).
 */
import "server-only";
import type { EventDetail, OccurrenceCard, SearchResult } from "@afisha/contract";
import { addDays } from "@afisha/i18n";
import { getDashboard } from "./admin-api";
import type { DataQualityRow } from "./admin-types";
import { REGION_TZ } from "./config";
import { isValidDate, todayIn } from "./datetime";
import { getEvent, organizationOccurrences } from "./public-api";
import { averageIndex, type Hint, type MissingPart, missingParts, qualityHints } from "./quality";

export const CABINET_PERIODS = [30, 90, 180] as const;
export type CabinetPeriod = (typeof CABINET_PERIODS)[number];

export function parseCabinetPeriod(v: unknown): CabinetPeriod {
  const n = Number(v);
  return (CABINET_PERIODS as readonly number[]).includes(n) ? (n as CabinetPeriod) : 30;
}

const DETAILS_LIMIT = 12;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface WeakCard {
  id: string;
  title: string;
  score: number | null;
  missing: MissingPart[];
}

export interface CabinetQuality {
  index: number | null;
  source: "pulse" | "events" | "none";
  sample: number;
  pulseRow: DataQualityRow | null;
  hints: Hint[];
  weakest: WeakCard[];
}

export async function loadSessions(opts: {
  organization: string;
  period: CabinetPeriod;
  /** YYYY-MM-DD в поясе региона; по умолчанию — сегодня */
  from?: string;
  q?: string;
  cursor?: string;
}): Promise<SearchResult> {
  const from = opts.from && isValidDate(opts.from) ? opts.from : todayIn(REGION_TZ);
  return organizationOccurrences({
    organization: opts.organization,
    dateFrom: from,
    dateTo: addDays(from, opts.period),
    q: opts.q,
    cursor: opts.cursor,
  });
}

export async function loadQuality(organization: string, cards: OccurrenceCard[]): Promise<CabinetQuality> {
  const eventIds = [...new Set(cards.map((c) => c.event.id))].slice(0, DETAILS_LIMIT);
  const [dashboard, details] = await Promise.all([
    getDashboard(30, "/cabinet").catch(() => null),
    mapLimit(eventIds, 6, (id) => getEvent(id).catch(() => null)),
  ]);
  const known = details.filter((d): d is EventDetail => d !== null);
  const pulseRow = dashboard?.data_quality.find((r) => r.id === organization) ?? null;
  const fromEvents = averageIndex(known.map((d) => d.quality_score));
  const index = pulseRow?.avg_quality ?? fromEvents;
  const weakest = known
    .map((d) => ({
      id: d.id,
      title: d.title,
      score: d.quality_score === null ? null : Math.round(d.quality_score * 100),
      missing: missingParts(d),
    }))
    .filter((w) => w.missing.length > 0)
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1))
    .slice(0, 5);
  return {
    index,
    source: pulseRow?.avg_quality != null ? "pulse" : fromEvents !== null ? "events" : "none",
    sample: known.length,
    pulseRow,
    hints: qualityHints(known).slice(0, 4),
    weakest,
  };
}

/** Площадки учреждения — из его сеансов (у /v1/venues нет фильтра по учреждению, см. отчёт). */
export function venuesOf(cards: OccurrenceCard[]): { id: string; name: string; address: string | null }[] {
  const map = new Map<string, { id: string; name: string; address: string | null }>();
  for (const c of cards)
    if (c.venue && !map.has(c.venue.id))
      map.set(c.venue.id, { id: c.venue.id, name: c.venue.name, address: c.venue.address });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
