/**
 * Реестр инструментов агента (ТЗ §7.2): у каждого инструмента формальный zod-контракт аргументов
 * и структурированный JSON-результат. Любая ошибка возвращается как {ok:false,error} — агент сообщает
 * о проблеме пользователю и НЕ подменяет результат догадкой.
 *
 * Действия, меняющие данные (subscribe, save_feedback), выполняются только через DI-колбэки:
 * их подключает вызывающий код (engagement-модуль) при регистрации маршрутов; без колбэка инструмент
 * честно отвечает «недоступно». Импортов из engagement здесь нет — модуль подключается позже.
 *
 * Лимит шагов (ТЗ §6.5): не более MAX_TOOL_CALLS вызовов на один ответ — следит ToolRunner.
 */
import type { CategoryCode, EventDetail, OccurrenceCard, SearchQuery, SearchResult } from "@afisha/contract";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { config } from "../../lib/config.js";
import { log } from "../../lib/log.js";
import { getEventDetail } from "../catalog/index.js";
import { REGION_TZ } from "../geo/index.js";
import { searchOccurrences } from "../search/index.js";
import { maskPii } from "./mask.js";
import type { MunicipalityRef } from "./rules-parser.js";

/** Дефолтный максимум вызовов инструментов на один ответ (AFISHA_AGENT_MAX_STEPS, по умолчанию 5). */
export const MAX_TOOL_CALLS = config.AFISHA_AGENT_MAX_STEPS;

/* ---------- Контракты ---------- */

const CATEGORY_CODES = ["theatre", "music", "museum", "kids", "folk", "cinema", "education"] as const;
export type ToolPeriod = "today" | "tomorrow" | "weekend" | "week" | "month";
export type ToolFeedbackKind = "translation" | "data" | "idea" | "other";

/** Один шаг трассы: инструмент, аргументы (маскированные) и число полученных результатов. */
export const TraceStepSchema = z.object({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  count: z.number().int(),
});
export type TraceStep = z.infer<typeof TraceStepSchema>;

export type ToolIssue = { path: string; message: string };
export type ToolFailure = { ok: false; error: string; reason?: string; issues?: ToolIssue[] };
export type ToolSuccess = { ok: true } & Record<string, unknown>;
export type ToolResult = ToolFailure | ToolSuccess;

/** DI-колбэк создания подписки: engagement-модуль выполняет create (replace=false) или delete+create (replace=true). */
export type SubscribeFn = (args: {
  city_id: string | null;
  category: CategoryCode | null;
  period: ToolPeriod | null;
  replace: boolean;
}) => Promise<{ ok: boolean; reason?: string }>;

/** DI-колбэк отправки заявки организатору (аналог POST /v1/feedback). */
export type SaveFeedbackFn = (args: {
  event_id: string | null;
  text: string;
  kind: ToolFeedbackKind;
}) => Promise<{ ok: boolean; reason?: string }>;

export type ToolContext = {
  db: Db;
  now: Date;
  lang: "ru" | "ba";
  munis: MunicipalityRef[];
  subscribeFn?: SubscribeFn;
  saveFeedbackFn?: SaveFeedbackFn;
};

/* ---------- Схемы аргументов (формальный контракт ТЗ 7.2 + расширенные фильтры конвейера) ---------- */

const CityArg = z.string().min(2).max(80);
const PeriodArg = z.enum(["today", "tomorrow", "weekend", "week", "month"]);

const SearchEventsArgs = z.object({
  city: CityArg.optional(),
  category: z.enum(CATEGORY_CODES).optional(),
  period: PeriodArg.optional(),
  price_max: z.number().min(0).max(1_000_000).optional(),
  age_max: z.number().int().min(0).max(17).optional(),
  text: z.string().min(1).max(300).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  // Расширенные фильтры: внутренний конвейер Гида передаёт полные слоты, наружу достаточно семи полй выше
  municipality: z.array(z.string().min(1).max(64)).max(16).optional(),
  categories: z.array(z.enum(CATEGORY_CODES)).max(7).optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  time_of_day: z
    .array(z.enum(["morning", "day", "evening"]))
    .max(3)
    .optional(),
  near: z.string().max(40).optional(),
  radius_km: z.number().min(0.5).max(200).optional(),
  tags: z.array(z.string().min(1).max(40)).max(10).optional(),
  free: z.boolean().optional(),
  pushkin: z.boolean().optional(),
  accessible: z.boolean().optional(),
  /** Вопрос о судьбе события («отменили?»): ищем и среди отменённых/перенесённых/прошедших */
  include_ended: z.boolean().optional(),
  time_from: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM — начало не раньше"),
  time_until: z.string().regex(/^\d{1,2}:\d{2}$/).optional().describe("HH:MM — начало не позже"),
  sort: z.enum(["relevance", "date", "price", "distance", "popular", "ending"]).optional(),
  offset: z.number().int().min(0).max(10_000).optional(),
});

const GetEventArgs = z.object({ id: z.string().uuid() });

const FindSimilarArgs = z.object({
  id: z.string().uuid(),
  city: CityArg.optional(),
  period: PeriodArg.optional(),
});

const GetVenueScheduleArgs = z.object({
  venue: z.string().min(2).max(200),
  period: PeriodArg.optional(),
});

const SubscribeArgs = z.object({
  city: CityArg.optional(),
  category: z.enum(CATEGORY_CODES).optional(),
  period: PeriodArg.optional(),
  replace: z.boolean().optional().describe("Перенос существующей подписки (delete+create) — внутренний флаг"),
});

const SaveFeedbackArgs = z.object({
  event_id: z.string().uuid().optional(),
  text: z.string().min(3).max(2000),
  kind: z.enum(["translation", "data", "idea", "other"]),
});

/* ---------- Вспомогательные функции ---------- */

const normName = (s: string) => s.toLowerCase().replaceAll("ё", "е").trim();

/** Город/район по названию или id: municipality — единая точка правды для всех инструментов. */
function resolveCity(city: string, munis: MunicipalityRef[]): { id: string | null; error: string | null } {
  const norm = normName(city);
  const direct = munis.find((m) => m.id === norm);
  if (direct) return { id: direct.id, error: null };
  // полное совпадение имени (ru/ba) точнее стемов; при конфликте стемов город важнее района
  // (стем «салават» есть и у города Салават, и у Салаватского района — нужен город)
  const exact = munis.filter((m) => normName(m.name) === norm || (m.nameBa != null && normName(m.nameBa) === norm));
  const byStems = munis.filter((m) => m.stems.some((s) => s === norm || (s.length > 3 && norm.startsWith(s))));
  const pool = exact.length ? exact : byStems;
  const hit = pool.find((m) => m.kind === "city") ?? pool[0];
  if (hit) return { id: hit.id, error: null };
  return { id: null, error: `Город или район «${city}» не найден — проверьте написание` };
}

/** Цена карточки в структурированном виде. */
const priceOf = (c: OccurrenceCard) =>
  c.event.price.is_free
    ? { is_free: true, min: null, max: null }
    : {
        is_free: false,
        min: c.event.price.min === null ? null : Math.round(Number(c.event.price.min)),
        max: c.event.price.max === null ? null : Math.round(Number(c.event.price.max)),
      };

/** Формальная карточка-строка результата search_events / find_similar / get_venue_schedule. */
function cardToItem(c: OccurrenceCard) {
  return {
    id: c.id,
    title: c.event.title,
    starts_at: c.starts_at,
    city: c.venue?.municipality ?? null,
    venue: c.venue?.name ?? null,
    price: priceOf(c),
    age: c.event.age_rating,
    status: c.status,
  };
}

type SearchArgs = z.infer<typeof SearchEventsArgs>;

function buildSearchQuery(args: SearchArgs, ctx: ToolContext): { query: SearchQuery; cityError: string | null } {
  const municipality = [...(args.municipality ?? [])];
  let cityError: string | null = null;
  // municipality — единая точка правды: city резолвим только когда id не переданы
  // (searchArgsFromQuery кладёт city как читаемую подпись для трассы — повторный резолв
  // при конфликте стемов расширял бы фильтр, например «Салават» → ещё и Салаватский район)
  if (args.city && municipality.length === 0) {
    const r = resolveCity(args.city, ctx.munis);
    if (r.id) municipality.push(r.id);
    else cityError = r.error;
  }
  const categories = args.categories ?? (args.category ? [args.category] : undefined);
  const query: SearchQuery = {
    q: args.text,
    date_from: args.date_from,
    date_to: args.date_to,
    when: args.period,
    time_of_day: args.time_of_day,
    time_from: args.time_from,
    time_until: args.time_until,
    municipality: municipality.length ? municipality : undefined,
    near: args.near,
    radius_km: args.radius_km,
    categories: categories?.length ? categories : undefined,
    free: args.free,
    price_max: args.price_max,
    age: args.age_max,
    pushkin: args.pushkin,
    accessible: args.accessible,
    include_ended: args.include_ended,
    // теги приходят строками из формального контракта; в SearchQuery они типизированы TagCode
    tags: args.tags?.length ? (args.tags as SearchQuery["tags"]) : undefined,
    sort: args.sort,
    limit: args.limit ?? 20,
    cursor: args.offset ? Buffer.from(String(args.offset)).toString("base64url") : undefined,
    lang: ctx.lang,
  };
  return { query, cityError };
}

/** Поисковый запрос → аргументы инструмента (для трассы: город читаемым названием). */
function searchArgsFromQuery(q: SearchQuery, ctx: ToolContext): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const muni = q.municipality?.[0];
  if (muni) {
    args.municipality = q.municipality;
    const label = ctx.munis.find((m) => m.id === muni)?.name;
    if (label) args.city = label;
  }
  if (q.categories?.length === 1) args.category = q.categories[0];
  else if (q.categories?.length) args.categories = q.categories;
  if (q.when) args.period = q.when;
  if (q.date_from) args.date_from = q.date_from;
  if (q.date_to) args.date_to = q.date_to;
  if (q.time_of_day?.length) args.time_of_day = q.time_of_day;
  if (q.time_from) args.time_from = q.time_from;
  if (q.time_until) args.time_until = q.time_until;
  if (q.near) args.near = q.near;
  if (q.radius_km) args.radius_km = q.radius_km;
  if (q.tags?.length) args.tags = q.tags;
  if (q.free) args.free = true;
  if (q.price_max !== undefined) args.price_max = q.price_max;
  if (q.age !== undefined) args.age_max = q.age;
  if (q.pushkin) args.pushkin = true;
  if (q.accessible) args.accessible = true;
  if (q.include_ended) args.include_ended = true;
  if (q.q) args.text = q.q;
  if (q.sort) args.sort = q.sort;
  args.limit = q.limit ?? 20;
  return args;
}

/** Площадка по id или названию (uuid проверяем напрямую, иначе ищем по имени). */
async function resolveVenue(db: Db, venue: string): Promise<string | null> {
  const v = venue.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    const r = (await db.execute<{ id: string }>(sql`SELECT id FROM venue WHERE id = ${v}`)).rows[0];
    return r?.id ?? null;
  }
  const q = `%${normName(v)}%`;
  const r = (
    await db.execute<{ id: string }>(sql`
      SELECT id FROM venue WHERE lower(replace(name->>'ru', 'ё', 'е')) LIKE ${q}
      ORDER BY (municipality_id IS NULL), name->>'ru' LIMIT 1`)
  ).rows[0];
  return r?.id ?? null;
}

/* ---------- Реестр ---------- */

export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly args: z.ZodType<unknown>;
  readonly execute: (args: unknown, ctx: ToolContext) => Promise<ToolResult>;
};

/** Определение инструмента с сохранением типизации аргументов. */
function defineTool<S extends z.ZodType>(def: {
  name: string;
  description: string;
  args: S;
  execute: (args: z.output<S>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDefinition {
  return {
    name: def.name,
    description: def.description,
    args: def.args as unknown as z.ZodType<unknown>,
    execute: def.execute as unknown as (args: unknown, ctx: ToolContext) => Promise<ToolResult>,
  };
}

export const TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: "search_events",
    description: "Поиск событий афиши по фильтрам: город, категория, период, цена, возраст, текст",
    args: SearchEventsArgs,
    execute: async (args, ctx) => {
      const { query, cityError } = buildSearchQuery(args, ctx);
      if (cityError) return { ok: false, error: cityError };
      const res = await searchOccurrences(ctx.db, query, ctx.now);
      return { ok: true, items: res.items.map(cardToItem), cards: res.items, total: res.total };
    },
  }),
  defineTool({
    name: "get_event",
    description: "Полная карточка события по идентификатору (все поля выдачи)",
    args: GetEventArgs,
    execute: async (args, ctx) => {
      const ev = await getEventDetail(ctx.db, args.id, ctx.lang);
      if (!ev) return { ok: false, error: "Событие не найдено — возможно, оно уже прошло" };
      return { ok: true, event: ev };
    },
  }),
  defineTool({
    name: "find_similar",
    description: "Похожие события: та же категория, тот же город (или заданный), ближайший период",
    args: FindSimilarArgs,
    execute: async (args, ctx) => {
      const ev = await getEventDetail(ctx.db, args.id, ctx.lang);
      if (!ev) return { ok: false, error: "Событие не найдено — не с чем сравнивать" };
      const cats = ev.categories.filter((c) => c !== "kids");
      const similarCats = cats.length ? [cats[0]!] : ev.categories;
      let muni: string | undefined;
      if (args.city) {
        const r = resolveCity(args.city, ctx.munis);
        if (!r.id) return { ok: false, error: r.error! };
        muni = r.id;
      } else {
        muni = ev.occurrences.find((o) => o.status !== "ended")?.venue?.municipality_id ?? undefined;
      }
      const res = await searchOccurrences(
        ctx.db,
        {
          categories: similarCats.length ? (similarCats as CategoryCode[]) : undefined,
          municipality: muni ? [muni] : undefined,
          when: args.period ?? "month",
          limit: 8,
          lang: ctx.lang,
        },
        ctx.now,
      );
      const items = res.items.filter((c) => c.event.id !== ev.id).slice(0, 6);
      return { ok: true, items: items.map(cardToItem), cards: items, total: items.length };
    },
  }),
  defineTool({
    name: "get_venue_schedule",
    description: "Расписание площадки: ближайшие события по идентификатору или названию",
    args: GetVenueScheduleArgs,
    execute: async (args, ctx) => {
      const venueId = await resolveVenue(ctx.db, args.venue);
      if (!venueId) return { ok: false, error: `Площадка «${args.venue}» не найдена` };
      const res = await searchOccurrences(
        ctx.db,
        { venue: venueId, when: args.period ?? "month", limit: 30, lang: ctx.lang },
        ctx.now,
      );
      return { ok: true, venue: venueId, items: res.items.map(cardToItem), cards: res.items, total: res.total };
    },
  }),
  defineTool({
    name: "subscribe",
    description:
      "Подписка на новые события по фильтрам; требует явного подтверждения пользователем (выполняется через внешний сервис подписок)",
    args: SubscribeArgs,
    execute: async (args, ctx) => {
      if (!ctx.subscribeFn) {
        return { ok: false, error: "Подписки сейчас недоступны — попробуйте позже", reason: "подписки недоступны" };
      }
      let cityId: string | null = null;
      if (args.city) {
        const r = resolveCity(args.city, ctx.munis);
        if (!r.id) return { ok: false, error: r.error! };
        cityId = r.id;
      }
      const res = await ctx.subscribeFn({
        city_id: cityId,
        category: args.category ?? null,
        period: args.period ?? null,
        replace: args.replace ?? false,
      });
      if (!res.ok) return { ok: false, error: "Не удалось оформить подписку", reason: res.reason };
      return {
        ok: true,
        subscription: {
          city_id: cityId,
          category: args.category ?? null,
          period: args.period ?? null,
          replaced: args.replace ?? false,
        },
      };
    },
  }),
  defineTool({
    name: "save_feedback",
    description: "Заявка организатору (обратная связь, правка данных); требует явного подтверждения пользователем",
    args: SaveFeedbackArgs,
    execute: async (args, ctx) => {
      if (!ctx.saveFeedbackFn) {
        return {
          ok: false,
          error: "Обратная связь сейчас недоступна — попробуйте позже",
          reason: "обратная связь недоступна",
        };
      }
      const res = await ctx.saveFeedbackFn({ event_id: args.event_id ?? null, text: args.text, kind: args.kind });
      if (!res.ok) return { ok: false, error: "Не удалось отправить заявку", reason: res.reason };
      return { ok: true, sent: true };
    },
  }),
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

export const toolNames = (): string[] => TOOLS.map((t) => t.name);

/** Спецификация инструментов для документации и тестов контракта. */
export const toolSpecs = () => TOOLS.map((t) => ({ name: t.name, description: t.description, args: t.args }));

/**
 * Вызов инструмента по формальному контракту: валидация zod → executor → структурированный JSON.
 * Неверные аргументы, неизвестное имя и сбои executor'а возвращаются как {ok:false}, без исключений.
 */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = byName.get(name);
  if (!tool) return { ok: false, error: `Неизвестный инструмент «${name}»` };
  const parsed = tool.args.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    const brief = issues.map((i) => `${i.path || "args"}: ${i.message}`).join("; ");
    return { ok: false, error: `Инструмент «${name}»: неверные аргументы (${brief})`, issues };
  }
  try {
    return await tool.execute(parsed.data, ctx);
  } catch (err) {
    log.warn({ tool: name, err: String(err) }, "assistant.tool_failed");
    return {
      ok: false,
      error: `Инструмент «${name}» не справился: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/* ---------- Runner: счётчик шагов, трасса, кандидаты ---------- */

const MASKED_ARG_KEYS = new Set(["text", "q"]);

/** Аргументы шага в трассу: компактно, длинные строки обрезаем, текст маскируем. */
function pruneArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      const s = MASKED_ARG_KEYS.has(k) ? maskPii(v) : v;
      out[k] = s.length > 200 ? `${s.slice(0, 200)}…` : s;
    } else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 20);
  }
  return out;
}

const resultCount = (res: ToolResult): number => {
  if (!res.ok) return 0;
  const r = res as Record<string, unknown>;
  if (Array.isArray(r.items)) return r.items.length;
  if (r.event) return 1;
  return 1; // действия (subscribe, save_feedback) — один результат
};

/**
 * Исполнитель вызовов инструментов для одного ответа Гида: не более maxCalls вызовов (ТЗ §6.5),
 * журналирование шагов и сбор всех идентификаторов-кандидатов, которые агент видел до выбора.
 */
export class ToolRunner {
  private readonly steps: TraceStep[] = [];
  private readonly seen = new Set<string>();
  private usedCalls = 0;
  private limitReachedAt: number | null = null;
  private readonly maxCalls: number;

  constructor(
    private readonly ctx: ToolContext,
    maxCalls?: number,
  ) {
    // читаем в конструкторе, а не на уровне модуля: конфиг может измениться (например, в тестах) после загрузки
    this.maxCalls = maxCalls ?? config.AFISHA_AGENT_MAX_STEPS;
  }

  get callCount(): number {
    return this.usedCalls;
  }

  /** БД контекста — для справочников (муниципалитеты) вне вызовов инструментов. */
  get db(): Db {
    return this.ctx.db;
  }

  get hitLimit(): boolean {
    return this.limitReachedAt !== null;
  }

  /** Все идентификаторы карточек, которые агент видел до выбора (для candidate_ids в трассе). */
  get candidateIds(): string[] {
    return [...this.seen];
  }

  get traceSteps(): TraceStep[] {
    return this.steps.map((s) => ({ tool: s.tool, args: { ...s.args }, count: s.count }));
  }

  async call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this.usedCalls >= this.maxCalls) {
      if (this.limitReachedAt === null) this.limitReachedAt = this.usedCalls;
      return {
        ok: false,
        error: `Достигнут лимит вызовов инструментов (${this.maxCalls} на один ответ) — показываю то, что уже найдено`,
      };
    }
    this.usedCalls++;
    const res = await runTool(name, args, this.ctx);
    this.steps.push({ tool: name, args: pruneArgs(args), count: resultCount(res) });
    this.collectIds(res);
    return res;
  }

  /** Поиск для внутреннего конвейера: формальный инструмент search_events, наружу — полный SearchResult. */
  async searchCards(query: SearchQuery): Promise<SearchResult> {
    const res = await this.call("search_events", searchArgsFromQuery(query, this.ctx));
    const r = res as Record<string, unknown>;
    const empty: SearchResult = {
      items: [],
      total: 0,
      next_cursor: null,
      applied: { date_from: query.date_from ?? "", date_to: query.date_to ?? "", timezone: REGION_TZ },
    };
    if (!res.ok) return empty;
    return {
      items: (r.cards as OccurrenceCard[] | undefined) ?? [],
      total: (r.total as number | undefined) ?? 0,
      next_cursor: null,
      applied: empty.applied,
    };
  }

  /** Карточка события для конвейера: формальный инструмент get_event. */
  async eventCard(id: string): Promise<EventDetail | null> {
    const res = await this.call("get_event", { id });
    const r = res as Record<string, unknown>;
    return res.ok ? (r.event as EventDetail) : null;
  }

  private collectIds(res: ToolResult): void {
    if (!res.ok) return;
    const r = res as Record<string, unknown>;
    const push = (x: unknown) => {
      if (typeof x === "string" && x.length > 0) this.seen.add(x);
    };
    if (Array.isArray(r.items)) for (const it of r.items) push((it as { id?: unknown }).id);
    if (Array.isArray(r.cards)) for (const c of r.cards) push((c as { id?: unknown }).id);
    const ev = r.event as { occurrences?: { id?: unknown }[] } | undefined;
    if (ev?.occurrences) for (const o of ev.occurrences) push(o.id);
  }
}
