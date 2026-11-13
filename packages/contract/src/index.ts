/**
 * Контракт публичного API «Афиши культуры РБ».
 * Изменения API начинаются здесь (docs/04-architecture.md §8, ADR-005).
 * Из этих схем Fastify строит OpenAPI 3.1 → packages/contract/openapi.json → клиенты Swift/Kotlin.
 */
import { z } from "zod";

export const Lang = z.enum(["ru", "ba"]).describe("Язык интерфейса и контента");
export type Lang = z.infer<typeof Lang>;

export const CategoryCode = z.enum(["theatre", "music", "museum", "kids", "folk", "cinema", "education"]);
export type CategoryCode = z.infer<typeof CategoryCode>;

export const TagCode = z.enum([
  "free",
  "pushkin",
  "premiere",
  "family",
  "youth",
  "accessible",
  "on_bashkir",
  "outdoor",
  "master_class",
  "excursion",
  "festival",
]);
export type TagCode = z.infer<typeof TagCode>;

export const OccurrenceStatus = z
  .enum(["scheduled", "rescheduled", "postponed", "cancelled", "sold_out", "unverified", "ended"])
  .describe("Статус сеанса: по плану, перенесено, отложено, отменено, распродано, уточняется, прошло");
export type OccurrenceStatus = z.infer<typeof OccurrenceStatus>;

export const Availability = z.enum(["unknown", "available", "few_left", "sold_out"]);
export const TrustLevel = z.enum(["official_plus", "official", "partner", "aggregated", "extracted"]);
export const Freshness = z.enum(["fresh", "aging", "stale", "vanished"]);

export const Money = z
  .string()
  .regex(/^\d+(\.\d{2})?$/)
  .describe('Сумма в рублях строкой: "500.00"');
export const Uuid = z.uuid();
export const DateTimeTz = z.string().describe("RFC 3339 с офсетом региона, например 2026-11-07T11:00:00+05:00");

export const Category = z.object({
  code: CategoryCode,
  title: z.string(),
  color: z.string(),
  count: z.number().int().optional(),
});
export type Category = z.infer<typeof Category>;

export const Municipality = z.object({
  id: z.string().describe("slug: ufa, sterlitamak, baymakskiy-rayon"),
  kind: z.enum(["city", "district"]),
  name: z.string(),
  name_ru: z.string(),
  name_ba: z.string().nullable(),
  center: z.tuple([z.number(), z.number()]).nullable().describe("[lat, lon]"),
  upcoming: z.number().int().optional().describe("Число предстоящих сеансов"),
});
export type Municipality = z.infer<typeof Municipality>;

export const Image = z.object({
  url: z.string(),
  author: z.string().nullable(),
  source: z.string().nullable(),
  license: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  color: z.string().nullable(),
});

export const VenueRef = z.object({
  id: Uuid,
  name: z.string(),
  address: z.string().nullable(),
  geo: z.tuple([z.number(), z.number()]).nullable().describe("[lat, lon]"),
  municipality_id: z.string().nullable(),
  municipality: z.string().nullable(),
});
export type VenueRef = z.infer<typeof VenueRef>;

export const Price = z.object({
  min: Money.nullable(),
  max: Money.nullable(),
  is_free: z.boolean(),
  currency: z.literal("RUB"),
});

export const Provenance = z.object({
  trust_level: TrustLevel,
  sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string().nullable() })),
  last_verified_at: DateTimeTz.nullable(),
  freshness: Freshness,
});
export type Provenance = z.infer<typeof Provenance>;

export const EventSummary = z.object({
  id: Uuid,
  title: z.string(),
  summary: z.string(),
  categories: z.array(CategoryCode),
  tags: z.array(TagCode),
  age_rating: z.number().int().describe("Возрастной знак 436-ФЗ: 0, 6, 12, 16, 18"),
  pushkin_card: z.boolean(),
  price: Price,
  image: Image.nullable(),
  organization: z.string().nullable(),
});
export type EventSummary = z.infer<typeof EventSummary>;

export const ReasonCode = z.enum([
  "age_fit",
  "budget_fit",
  "free",
  "near",
  "time_fit",
  "category_match",
  "pushkin",
  "accessible",
  "popular",
  "new",
  "last_chance",
  "on_bashkir",
  "text_match",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const OccurrenceCard = z.object({
  id: Uuid,
  event: EventSummary,
  venue: VenueRef.nullable(),
  starts_at: DateTimeTz,
  ends_at: DateTimeTz.nullable(),
  is_range: z.boolean().describe("Длительное событие (выставка): действует с starts_at по ends_at"),
  status: OccurrenceStatus,
  status_reason: z.string().nullable(),
  previous_starts_at: DateTimeTz.nullable(),
  availability: Availability,
  ticket_url: z.string().nullable(),
  more_dates: z.number().int().describe("Сколько ещё сеансов этого события в выдаче свёрнуто"),
  distance_km: z.number().nullable(),
  reasons: z.array(ReasonCode).describe("Почему карточка в выдаче (объяснимое ранжирование)"),
  freshness: Freshness,
});
export type OccurrenceCard = z.infer<typeof OccurrenceCard>;

export const ChangeEntry = z.object({
  at: DateTimeTz,
  kind: z.string(),
  field: z.string().nullable(),
  old: z.unknown().nullable(),
  new: z.unknown().nullable(),
  text: z.string().describe("Человекочитаемое описание изменения"),
  source: z.string().nullable(),
});
export type ChangeEntry = z.infer<typeof ChangeEntry>;

export const EventDetail = EventSummary.extend({
  description_html: z.string(),
  images: z.array(Image),
  languages: z.array(z.string()),
  is_permanent: z.boolean(),
  ticket_url: z.string().nullable(),
  accessibility: z.record(z.string(), z.unknown()),
  occurrences: z.array(OccurrenceCard.omit({ event: true })),
  provenance: Provenance,
  history: z.array(ChangeEntry),
  source_url: z.string().nullable(),
  quality_score: z.number().nullable(),
});
export type EventDetail = z.infer<typeof EventDetail>;

/** Булев параметр строки запроса: "true"/"1"/"yes" → true, "false"/"0"/"no" → false. z.coerce.boolean тут нельзя: он делает "false" → true. */
const qbool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "да"].includes(s)) return true;
    if (["false", "0", "no", "нет", ""].includes(s)) return false;
  }
  return v;
}, z.boolean()) as unknown as z.ZodType<boolean>;

export const SortMode = z
  .enum(["relevance", "date", "price", "distance", "popular", "ending"])
  .describe("ending — сначала те, что скоро заканчиваются («Последний шанс»)");

const csv = <T extends z.ZodType>(item: T) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(item),
  ) as unknown as z.ZodType<z.infer<T>[]>;

export const SearchQuery = z.object({
  q: z.string().max(300).optional().describe("Свободный текст"),
  date_from: z.string().optional().describe("YYYY-MM-DD в TZ региона (по умолчанию сегодня)"),
  date_to: z.string().optional().describe("YYYY-MM-DD включительно"),
  when: z.enum(["today", "tomorrow", "weekend", "week", "month"]).optional(),
  time_of_day: csv(z.enum(["morning", "day", "evening"])).optional(),
  municipality: csv(z.string()).optional(),
  near: z.string().optional().describe("lat,lon"),
  radius_km: z.coerce.number().min(0.5).max(200).optional(),
  categories: csv(CategoryCode).optional(),
  tags: csv(TagCode).optional(),
  free: qbool.optional(),
  price_max: z.coerce.number().min(0).optional(),
  age: z.coerce.number().int().min(0).max(17).optional().describe("Возраст ребёнка: только подходящие по знаку"),
  age_rating_max: z.coerce.number().int().optional(),
  pushkin: qbool.optional(),
  accessible: qbool.optional(),
  venue: Uuid.optional(),
  organization: Uuid.optional(),
  events: csv(Uuid).optional().describe("Только эти события (например, избранное)"),
  include_ended: qbool.optional(),
  hide_sold_out: qbool.optional(),
  ends_before: z.string().optional().describe("YYYY-MM-DD: только события, которые заканчиваются не позже этой даты"),
  sort: SortMode.optional(),
  group: qbool.optional().describe("Сворачивать сеансы одного события (по умолчанию да)"),
  lang: Lang.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SearchResult = z.object({
  items: z.array(OccurrenceCard),
  total: z.number().int(),
  next_cursor: z.string().nullable(),
  applied: z.object({
    date_from: z.string(),
    date_to: z.string(),
    timezone: z.string(),
  }),
});
export type SearchResult = z.infer<typeof SearchResult>;

export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
});

/* ---------- Ассистент (Гид) ---------- */

export const SlotSource = z.enum(["user", "inferred", "profile", "default"]);

export const Slots = z.object({
  intent: z.enum(["search", "refine", "event_question", "plan_day", "help", "smalltalk", "offtopic"]),
  date_from: z.string().nullable(),
  date_to: z.string().nullable(),
  date_label: z.string().nullable(),
  date_source: SlotSource.nullable(),
  time_of_day: z.array(z.enum(["morning", "day", "evening"])),
  municipality_id: z.string().nullable(),
  municipality_label: z.string().nullable(),
  municipality_source: SlotSource.nullable(),
  near_me: z.boolean(),
  budget: z.number().nullable(),
  budget_per: z.enum(["ticket", "total", "unknown"]).nullable(),
  free_only: z.boolean(),
  kids_ages: z.array(z.number().int()),
  with_kids: z.boolean(),
  adults: z.number().int().nullable(),
  categories: z.array(CategoryCode),
  tags: z.array(TagCode),
  pushkin: z.boolean(),
  accessible: z.boolean(),
  text: z.string().nullable().describe("Остаток запроса для полнотекстового поиска"),
});
export type Slots = z.infer<typeof Slots>;

export const SlotChip = z.object({
  slot: z.string(),
  label: z.string(),
  source: SlotSource,
  clear: z.record(z.string(), z.unknown()).nullable().describe("Патч для запроса к Гиду, который убирает это условие"),
});
export type SlotChip = z.infer<typeof SlotChip>;

export const QuickReply = z.object({
  id: z.string(),
  label: z.string(),
  patch: z.record(z.string(), z.unknown()).describe("Изменение слотов при нажатии"),
});
export type QuickReply = z.infer<typeof QuickReply>;

export const AssistantPick = z.object({
  occurrence: OccurrenceCard,
  reason_codes: z.array(ReasonCode),
  reason_text: z.string().describe("Объяснение, прошедшее верификатор фактов"),
});
export type AssistantPick = z.infer<typeof AssistantPick>;

export const AssistantResponse = z.object({
  conversation_id: z.string(),
  kind: z.enum(["results", "clarify", "empty", "answer", "offtopic", "help", "error"]),
  text: z.string(),
  chips: z.array(SlotChip),
  clarify: z.object({ slot: z.string(), question: z.string(), options: z.array(QuickReply) }).nullable(),
  picks: z.array(AssistantPick),
  relaxed: z.array(z.string()).describe("Какие ограничения были ослаблены, если точных совпадений нет"),
  followups: z.array(QuickReply),
  slots: Slots,
  mode: z.enum(["llm", "rules"]).describe("llm — с GigaChat, rules — режим без ИИ (деградация)"),
});
export type AssistantResponse = z.infer<typeof AssistantResponse>;

export const AssistantRequest = z.object({
  conversation_id: z.uuid().optional().describe("Идентификатор диалога, выданный сервером в прошлом ответе"),
  text: z.string().max(1000).optional(),
  patch: z.record(z.string(), z.unknown()).optional().describe("Нажатие быстрого ответа или изменение чипа"),
  event_id: Uuid.optional().describe("Вопрос о конкретном событии"),
  lang: Lang.optional(),
  municipality_id: z.string().optional().describe("Город по умолчанию из профиля"),
  near: z.string().optional(),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;

export const ReportRequest = z.object({
  event_id: Uuid,
  occurrence_id: Uuid.optional(),
  reason: z.enum(["cancelled", "wrong_time", "wrong_price", "wrong_place", "other"]),
  comment: z.string().max(1000).optional(),
});
export type ReportRequest = z.infer<typeof ReportRequest>;

export const Stats = z.object({
  events: z.number().int(),
  upcoming_occurrences: z.number().int(),
  venues: z.number().int(),
  municipalities_with_events: z.number().int(),
  free_share: z.number(),
  pushkin_share: z.number(),
  updated_at: DateTimeTz.nullable(),
});
export type Stats = z.infer<typeof Stats>;

export const VenueDetail = z.object({
  id: Uuid,
  name: z.string(),
  address: z.string().nullable(),
  geo: z.tuple([z.number(), z.number()]).nullable().describe("[lat, lon]"),
  municipality_id: z.string().nullable(),
  municipality: z.string().nullable(),
  organization: z.string().nullable(),
  accessibility: z.record(z.string(), z.unknown()),
  upcoming: z.array(OccurrenceCard),
  upcoming_total: z.number().int(),
});
export type VenueDetail = z.infer<typeof VenueDetail>;

export const OrganizationRef = z.object({
  id: Uuid,
  name: z.string(),
  municipality: z.string().nullable(),
  upcoming: z.number().int(),
});
export type OrganizationRef = z.infer<typeof OrganizationRef>;

export const VenueListItem = VenueRef.extend({ organization: z.string().nullable(), upcoming: z.number().int() });
export type VenueListItem = z.infer<typeof VenueListItem>;

export const FeedbackRequest = z.object({
  kind: z.enum(["translation", "data", "idea", "other"]),
  text: z.string().min(3).max(2000),
  page: z.string().max(500).optional().describe("Адрес страницы или экрана"),
  lang: Lang.optional(),
  original: z.string().max(1000).optional().describe("Исходная строка — для правки перевода"),
  suggestion: z.string().max(1000).optional().describe("Предлагаемый вариант — для правки перевода"),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

export const RankingRules = z.object({
  updated_at: z.string(),
  owner: z.string(),
  contact_email: z.string(),
  personalization: z.object({ enabled_by_default: z.boolean(), how_to_disable: z.string() }),
  data_used: z.array(z.string()),
  data_sources: z.array(z.string()),
  factors: z.array(z.object({ code: z.string(), title: z.string(), weight: z.number(), description: z.string() })),
  diversification: z.string(),
  assistant: z.string(),
});
export type RankingRules = z.infer<typeof RankingRules>;

export const FavoriteList = z.object({ event_ids: z.array(Uuid), items: z.array(OccurrenceCard) });
export type FavoriteList = z.infer<typeof FavoriteList>;

/* ---------- Кабинет учреждения ---------- */
export const CabinetEventCreate = z.object({
  organization_id: Uuid,
  venue_id: Uuid.describe("Площадка учреждения (GET /v1/venues)"),
  title: z.string().min(3).max(200),
  summary: z.string().max(600).default(""),
  categories: z.array(CategoryCode).min(1),
  age_rating: z
    .union([z.literal(0), z.literal(6), z.literal(12), z.literal(16), z.literal(18)])
    .describe("Обязателен по 436-ФЗ"),
  starts_at: z.string().datetime({ offset: true }).describe("Например 2026-11-14T18:00:00+05:00"),
  ends_at: z.string().datetime({ offset: true }).optional(),
  is_free: z.boolean().default(false),
  price_min: z.number().min(0).optional(),
  price_max: z.number().min(0).optional(),
  ticket_url: z
    .url({ protocol: /^https?$/ })
    .optional()
    .describe("Только http(s)"),
  pushkin_card: z.boolean().default(false),
});
export type CabinetEventCreate = z.infer<typeof CabinetEventCreate>;

/* Имена схем в OpenAPI components: общие типы в сгенерированных клиентах Swift/Kotlin */
const NAMED: [z.ZodType, string][] = [
  [Category, "Category"],
  [Municipality, "Municipality"],
  [Image, "Image"],
  [VenueRef, "VenueRef"],
  [Price, "Price"],
  [Provenance, "Provenance"],
  [EventSummary, "EventSummary"],
  [OccurrenceCard, "OccurrenceCard"],
  [ChangeEntry, "ChangeEntry"],
  [EventDetail, "EventDetail"],
  [SearchResult, "SearchResult"],
  [Problem, "Problem"],
  [Slots, "Slots"],
  [SlotChip, "SlotChip"],
  [QuickReply, "QuickReply"],
  [AssistantPick, "AssistantPick"],
  [AssistantResponse, "AssistantResponse"],
  [AssistantRequest, "AssistantRequest"],
  [ReportRequest, "ReportRequest"],
  [Stats, "Stats"],
  [VenueDetail, "VenueDetail"],
  [OrganizationRef, "OrganizationRef"],
  [VenueListItem, "VenueListItem"],
  [FeedbackRequest, "FeedbackRequest"],
  [RankingRules, "RankingRules"],
  [FavoriteList, "FavoriteList"],
  [CabinetEventCreate, "CabinetEventCreate"],
];
for (const [schema, id] of NAMED) if (!z.globalRegistry.has(schema)) z.globalRegistry.add(schema, { id });
