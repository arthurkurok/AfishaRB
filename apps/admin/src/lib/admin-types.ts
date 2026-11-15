/**
 * Ответы Admin API, которых пока нет в `@afisha/contract` (дашборд, очередь модерации, жалобы, черновик ИИ-помощника,
 * смена статуса). Описаны здесь zod-схемами — ответ проверяется во время выполнения, а расхождение с API видно сразу.
 * Кандидаты на перенос в контракт (CLAUDE.md, инвариант 3) — см. отчёт apps/admin.
 */
import { z } from "zod";

/** PostgreSQL отдаёт timestamptz текстом «2026-11-02 14:48:19.675+00» — превращаем в ISO 8601. */
export function pgTimestampToIso(value: string): string {
  const s = value.trim().replace(" ", "T");
  // «+00» → «+00:00», «+0530» → «+05:30»
  return s.replace(/([+-]\d{2})(\d{2})?$/, (_m, h: string, m?: string) => `${h}:${m ?? "00"}`);
}

const Timestamp = z.string().transform(pgTimestampToIso);
const Count = z.coerce.number().int();

export const DashboardTotals = z.object({
  events: Count,
  occurrences: Count,
  municipalities_covered: Count,
  municipalities_total: Count,
  searches: Count,
  zero_results: Count,
  assistant_dialogs: Count,
});

export const SupplyRow = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  upcoming: Count,
  free: Count,
  pushkin: Count,
  kids: Count,
});

export const Dashboard = z.object({
  period_days: Count,
  totals: DashboardTotals,
  culture_deserts: z.array(z.object({ id: z.string(), name: z.string(), upcoming: Count })),
  supply: z.array(SupplyRow),
  by_category: z.array(z.object({ code: z.string(), n: Count })),
  demand_top: z.array(z.object({ query: z.string(), n: Count, avg_results: z.coerce.number().nullable() })),
  demand_without_supply: z.array(
    z.object({
      municipality: z.string().nullable(),
      categories: z.string().nullable(),
      with_kids: z.boolean(),
      n: Count,
      example: z.string().nullable(),
    }),
  ),
  data_quality: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      events: Count,
      avg_quality: z.coerce.number().nullable(),
      no_image: Count,
      no_price: Count,
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      last_success_at: Timestamp.nullable(),
      last_stats: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
  moderation: z.array(z.object({ kind: z.string(), open: Count })),
});
export type Dashboard = z.infer<typeof Dashboard>;
export type SupplyRow = z.infer<typeof SupplyRow>;
export type DataQualityRow = Dashboard["data_quality"][number];
export type SourceRow = Dashboard["sources"][number];

export const ModerationTask = z.object({
  id: z.string(),
  kind: z.string(),
  state: z.string(),
  priority: Count,
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  related_id: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  resolution: z.string().nullable(),
  resolved_by: z.string().nullable(),
  created_at: Timestamp,
  updated_at: Timestamp,
  title_a: z.string().nullable(),
  title_b: z.string().nullable(),
  // Поля API от 15.11 (необязательные: админка работает и с прежней версией API)
  /** Событие задачи: для дублей и замечаний — сама сущность, для сеанса — его событие */
  event_id: z.string().nullable().optional(),
  /** Сколько открытых задач «исчезнувший сеанс» у этого события */
  group_size: Count.optional(),
  /** Сеанс задачи (null — задача на событие) */
  occurrence: z
    .object({
      id: z.string(),
      event_id: z.string().nullable(),
      starts_at: z.string().nullable(),
      ends_at: z.string().nullable(),
      status: z.string().nullable(),
      status_reason: z.string().nullable(),
      venue: z.object({ id: z.string(), name: z.string().nullable(), address: z.string().nullable() }).nullable(),
      municipality_id: z.string().nullable(),
      municipality: z.string().nullable(),
    })
    .nullable()
    .optional(),
});
export type ModerationTask = z.infer<typeof ModerationTask>;

export const ReportRow = z.object({
  id: z.string(),
  event_id: z.string().nullable(),
  occurrence_id: z.string().nullable(),
  reason: z.string(),
  comment: z.string().nullable(),
  channel: z.string(),
  context: z.record(z.string(), z.unknown()).nullable(),
  created_at: Timestamp,
  title: z.string().nullable(),
});
export type ReportRow = z.infer<typeof ReportRow>;

/** Черновик карточки от ИИ-помощника (POST /admin/events/extract). */
export const EventDraft = z.object({
  title: z.string(),
  summary: z.string(),
  categories: z.array(z.string()),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  time: z.string().nullable(),
  age_rating: z.number().nullable(),
  is_free: z.boolean(),
  price_min: z.number().nullable(),
  confidence: z.record(z.string(), z.number()),
  mode: z.enum(["rules", "llm"]),
  warnings: z.array(z.string()),
});
export type EventDraft = z.infer<typeof EventDraft>;

/** Статусы, которые учреждение может выставить сеансу (POST /admin/occurrences/{id}/status). */
export const SettableStatus = z.enum(["scheduled", "cancelled", "rescheduled", "postponed", "sold_out"]);
export type SettableStatus = z.infer<typeof SettableStatus>;

export const StatusChangeBody = z.object({
  status: SettableStatus,
  reason: z.string().max(300).optional(),
  new_starts_at: z.string().datetime({ offset: true }).optional(),
});
export type StatusChangeBody = z.infer<typeof StatusChangeBody>;

export const StatusChangeResult = z.object({
  ok: z.literal(true),
  status: z.string(),
  rescheduled_to: z.string().nullable().optional(),
});

export const CreatedEvent = z.object({ event_id: z.string() });

/** Решения по задаче: дубли — merge/distinct, исчезнувший сеанс — confirm/cancel, любая задача — dismiss. */
export const ModerationAction = z.enum(["merge", "distinct", "dismiss", "confirm", "cancel"]);
export type ModerationAction = z.infer<typeof ModerationAction>;

/** Охват решения: task — только эта задача, event — все открытые «исчезнувшие сеансы» события. */
export const ModerationScope = z.enum(["task", "event"]);
export type ModerationScope = z.infer<typeof ModerationScope>;

/** Ответ на решение: resolved — сколько задач закрыто (в прежней версии API поля нет). */
export const ResolveResponse = z.object({ ok: z.literal(true), resolved: Count.optional() });

/** Отчёт импорта файла (POST /admin/import): счётчики и отклонённые строки с причинами. */
export const ImportReport = z.object({
  filename: z.string().nullable(),
  format: z.enum(["csv", "json"]),
  dry_run: z.boolean(),
  total: Count,
  added: Count,
  updated: Count,
  unchanged: Count,
  rejected: z.array(z.object({ row: Count, reason: z.string() })),
});
export type ImportReport = z.infer<typeof ImportReport>;
