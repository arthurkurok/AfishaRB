/**
 * Маршруты Гида: диалог, статус ИИ и просмотр трасс из админки (ТЗ 7.4 — «трасса доступна из админки»).
 * Трассы отдают только авторизованному админу (Bearer, authenticate из organizer/auth) и скрыты из OpenAPI.
 */
import { AssistantRequest, Problem } from "@afisha/contract";
import { desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { assistantTrace } from "../../db/schema.js";
import { log } from "../../lib/log.js";
import { resolveProfile } from "../accounts/index.js";
import { authenticate } from "../organizer/index.js";
import { getGateway } from "./gateway.js";
import { AssistantResponseV2, handleAssistant } from "./service.js";
import type { SaveFeedbackFn, SubscribeFn } from "./tools.js";

const problem = (status: number, title: string) => ({ type: "about:blank", title, status });

/* ---------- DI для действий гида (ТЗ 7.2): подписка и заявка — через модули, а не SQL в ассистенте ---------- */

/** Подписка/перенос подписки из диалога с гидом: та же таблица saved_search, что и у /v1/subscriptions. */
const subscribeViaDialog =
  (db: Db, profileId: string): SubscribeFn =>
  async ({ city_id, category, period, replace }) => {
    try {
      const filters: Record<string, unknown> = {
        municipality: city_id,
        categories: category ? [category] : [],
        period: period ?? null,
      };
      if (replace) {
        await db.execute(
          sql`DELETE FROM saved_search WHERE profile_id = ${profileId} AND (query->>'municipality') IS DISTINCT FROM ${city_id}`,
        );
      }
      const title = `${city_id ? `город ${city_id}` : "все города"}${category ? `, ${category}` : ""}`;
      await db.execute(
        sql`INSERT INTO saved_search (profile_id, title, query) VALUES (${profileId}, ${title}, ${JSON.stringify(filters)}::jsonb)`,
      );
      return { ok: true, subscription_id: null };
    } catch (err) {
      log.warn({ err: String(err) }, "assistant.subscribe_failed");
      return { ok: false, reason: "подписка не создалась" };
    }
  };

/** Заявка организатору из диалога с гидом: та же таблица report, что и у /v1/feedback. */
const saveFeedbackViaDialog =
  (db: Db, channel: string): SaveFeedbackFn =>
  async ({ event_id, text, kind }) => {
    try {
      const eventId = event_id && /^[0-9a-f-]{36}$/i.test(event_id) ? event_id : null;
      await db.execute(
        sql`INSERT INTO report (event_id, reason, comment, channel, context) VALUES (${eventId}::uuid, ${`feedback_${kind}`}, ${text.slice(0, 2000)}, 'assistant', '{}'::jsonb)`,
      );
      return { ok: true };
    } catch (err) {
      log.warn({ err: String(err) }, "assistant.feedback_failed");
      return { ok: false, reason: "заявка не сохранилась" };
    }
  };

/** Запись трассы для админки: строка assistant_trace, шаги инструментов — внутри verifier.agent. */
const TraceRow = z.object({
  id: z.number().int(),
  conversation_id: z.string(),
  channel: z.string(),
  prompt_version: z.string(),
  models: z.array(z.string()),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  latency_ms: z.record(z.string(), z.number()),
  text_masked: z.string(),
  slots: z.record(z.string(), z.unknown()),
  decision: z.string(),
  candidate_ids: z.array(z.string()),
  picked_ids: z.array(z.string()),
  verifier: z.record(z.string(), z.unknown()),
  mode: z.string(),
  feedback: z.number().int().nullable(),
  created_at: z.string().nullable(),
});

const toRow = (r: typeof assistantTrace.$inferSelect) => ({
  id: r.id,
  conversation_id: r.conversationId,
  channel: r.channel,
  prompt_version: r.promptVersion,
  models: r.models,
  tokens_in: r.tokensIn,
  tokens_out: r.tokensOut,
  latency_ms: r.latencyMs,
  text_masked: r.textMasked,
  slots: r.slots,
  decision: r.decision,
  candidate_ids: r.candidateIds,
  picked_ids: r.pickedIds,
  verifier: r.verifier,
  mode: r.mode,
  feedback: r.feedback ?? null,
  created_at: r.createdAt ? new Date(r.createdAt).toISOString() : null,
});

export function registerAssistantApi(app: FastifyInstance, db: Db): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post(
    "/v1/assistant",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "askAssistant",
        tags: ["Гид"],
        summary: "ИИ-гид: свободный запрос → уточнение → подборка реальных событий с объяснениями",
        description:
          "Карточки строятся только из базы по ID; объяснения GigaChat проходят верификатор фактов. Без GigaChat работает режим правил (mode=rules). В ответе — трасса вызовов инструментов (trace.steps) и, при необходимости, запрос подтверждения действия (confirm).",
        body: AssistantRequest,
        response: { 200: AssistantResponseV2 },
      },
    },
    async (req) => {
      // Профиль (X-Device-Id / Telegram initData) нужен только для действий гида —
      // поиск работает и без него; без профиля subscribe/save_feedback честно отклоняются
      const profileId = await resolveProfile(db, req.headers).catch(() => null);
      return handleAssistant(db, req.body, {
        channel: String(req.headers["x-afisha-channel"] ?? "web"),
        subscribeFn: profileId ? subscribeViaDialog(db, profileId) : undefined,
        saveFeedbackFn: saveFeedbackViaDialog(db, String(req.headers["x-afisha-channel"] ?? "web")),
      });
    },
  );
  r.get(
    "/v1/assistant/status",
    {
      schema: {
        operationId: "assistantStatus",
        tags: ["Гид"],
        summary: "Доступность ИИ (для баннера деградации)",
        response: {
          200: z.object({ providers: z.array(z.string()), available: z.boolean(), spentTokens: z.number() }),
        },
      },
    },
    async () => getGateway().status(),
  );

  /* ---------- Трассы (ТЗ 7.4): только для админа, скрыты из публичной спецификации ---------- */
  r.get(
    "/v1/assistant/traces",
    {
      schema: {
        hide: true,
        tags: ["Гид"],
        operationId: "listAssistantTraces",
        summary: "Последние 50 трасс Гида (только админ, скрыто из OpenAPI)",
        response: { 200: z.array(TraceRow), 401: Problem },
      },
    },
    async (req, reply) => {
      if (!authenticate(req.headers.authorization)) return reply.code(401).send(problem(401, "Нужна авторизация"));
      const rows = await db.select().from(assistantTrace).orderBy(desc(assistantTrace.id)).limit(50);
      return rows.map(toRow);
    },
  );
  r.get(
    "/v1/assistant/traces/:id",
    {
      schema: {
        hide: true,
        tags: ["Гид"],
        operationId: "getAssistantTrace",
        summary: "Трасса Гида по идентификатору (только админ, скрыто из OpenAPI)",
        params: z.object({ id: z.coerce.number().int().positive() }),
        response: { 200: TraceRow, 401: Problem, 404: Problem },
      },
    },
    async (req, reply) => {
      if (!authenticate(req.headers.authorization)) return reply.code(401).send(problem(401, "Нужна авторизация"));
      const rows = await db.select().from(assistantTrace).where(eq(assistantTrace.id, req.params.id)).limit(1);
      if (!rows[0]) return reply.code(404).send(problem(404, "Трасса не найдена"));
      return toRow(rows[0]);
    },
  );
}
