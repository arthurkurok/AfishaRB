/**
 * Карточка задачи «возможные дубли»: сравнение двух событий бок о бок с подсветкой расхождений.
 * Чистые функции — покрыты тестами.
 */
import type { EventDetail } from "@afisha/contract";
import { formatSession } from "./datetime";

export interface CompareRow {
  key: string;
  label: string;
  a: string;
  b: string;
  differs: boolean;
}

const fmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function priceText(p: EventDetail["price"]): string {
  if (p.is_free) return "бесплатно";
  const min = p.min === null ? null : Number(p.min);
  const max = p.max === null ? null : Number(p.max);
  if (min === null && max === null) return "не указана";
  if (min !== null && max !== null && max > min) return `${fmt.format(min)}–${fmt.format(max)} ₽`;
  return `от ${fmt.format(min ?? max ?? 0)} ₽`;
}

type Ev = Pick<
  EventDetail,
  | "title"
  | "organization"
  | "occurrences"
  | "age_rating"
  | "price"
  | "categories"
  | "provenance"
  | "quality_score"
  | "summary"
>;

function nearest(e: Ev) {
  const live = e.occurrences.filter((o) => o.status !== "ended");
  return [...(live.length ? live : e.occurrences)].sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0] ?? null;
}

const norm = (s: string) => s.trim().toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ");

export function compareEvents(
  a: Ev,
  b: Ev,
  tz: string,
  categoryLabel: (code: string) => string,
  now: Date = new Date(),
): CompareRow[] {
  const oa = nearest(a);
  const ob = nearest(b);
  const rows: Omit<CompareRow, "differs">[] = [
    { key: "title", label: "Название", a: a.title, b: b.title },
    { key: "organization", label: "Организатор", a: a.organization ?? "—", b: b.organization ?? "—" },
    { key: "venue", label: "Площадка", a: oa?.venue?.name ?? "—", b: ob?.venue?.name ?? "—" },
    {
      key: "when",
      label: "Ближайший сеанс",
      a: oa ? formatSession(oa.starts_at, tz, now) : "—",
      b: ob ? formatSession(ob.starts_at, tz, now) : "—",
    },
    { key: "sessions", label: "Сеансов", a: String(a.occurrences.length), b: String(b.occurrences.length) },
    { key: "age", label: "Возраст", a: `${a.age_rating}+`, b: `${b.age_rating}+` },
    { key: "price", label: "Цена", a: priceText(a.price), b: priceText(b.price) },
    {
      key: "categories",
      label: "Категории",
      a: a.categories.map(categoryLabel).join(", ") || "—",
      b: b.categories.map(categoryLabel).join(", ") || "—",
    },
    {
      key: "source",
      label: "Источник",
      a: a.provenance.sources.map((s) => s.title).join(", ") || "—",
      b: b.provenance.sources.map((s) => s.title).join(", ") || "—",
    },
    {
      key: "quality",
      label: "Индекс полноты",
      a: a.quality_score === null ? "—" : String(Math.round(a.quality_score * 100)),
      b: b.quality_score === null ? "—" : String(Math.round(b.quality_score * 100)),
    },
  ];
  return rows.map((r) => ({ ...r, differs: norm(r.a) !== norm(r.b) }));
}

/** Оценка и причины из payload задачи дедупликации. */
export function dedupPayload(payload: Record<string, unknown> | null): { score: number | null; reasons: string[] } {
  const score = typeof payload?.score === "number" ? payload.score : null;
  const reasons = Array.isArray(payload?.reasons)
    ? payload.reasons.filter((r): r is string => typeof r === "string")
    : [];
  return { score, reasons };
}

/** Соседние задачи в очереди: «Отложить» ведёт к следующей, по кругу. */
export function neighbours(
  ids: string[],
  current: string,
): { prev: string | null; next: string | null; position: number } {
  const i = ids.indexOf(current);
  if (i === -1 || ids.length < 2) return { prev: null, next: null, position: i + 1 };
  return {
    prev: ids[(i - 1 + ids.length) % ids.length]!,
    next: ids[(i + 1) % ids.length]!,
    position: i + 1,
  };
}
