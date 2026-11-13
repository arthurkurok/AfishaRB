/**
 * Подписки на фильтр поиска — город и/или категории (docs/03-functional-spec.md §3.5, ТЗ: разделы 3, 6.2, 12).
 * Хранится в saved_search (query jsonb: municipality, categories, period); дайджест новых событий —
 * modules/notify/digest.ts. Отписка — жёсткое удаление строки. Профиль тот же, что у избранного:
 * X-Device-Id или X-Telegram-Init-Data, без персональных данных (ТЗ 6.2).
 */
import {
  type CategoryCode,
  Problem,
  Subscription,
  SubscriptionCreate,
  SubscriptionList,
  type SubscriptionPeriod,
} from "@afisha/contract";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { resolveProfile } from "../accounts/index.js";
import { toRegionIso } from "../geo/index.js";
import { subscriptionTitle } from "../notify/index.js";

const unauthorized = {
  type: "about:blank",
  title: "Нужен заголовок X-Device-Id или X-Telegram-Init-Data",
  status: 401,
};

const badRequest = (detail: string) => ({
  type: "about:blank",
  title: "Некорректный запрос",
  status: 400,
  detail,
});

/** Фильтры подписки в saved_search.query. */
export type SubscriptionFilters = {
  municipality: string | null;
  categories: CategoryCode[];
  period: SubscriptionPeriod | null;
};

type SubRow = {
  id: string;
  title: string;
  query: Partial<SubscriptionFilters>;
  last_notified_at: Date | string | null;
  created_at: Date | string;
};

/** Строка БД → публичная схема Subscription (даты — RFC 3339 в поясе региона). */
export function toSubscription(r: SubRow): z.infer<typeof Subscription> {
  return {
    id: r.id,
    title: r.title,
    municipality: r.query.municipality ?? null,
    categories: (r.query.categories ?? []) as CategoryCode[],
    period: (r.query.period ?? null) as SubscriptionPeriod | null,
    created_at: toRegionIso(new Date(r.created_at))!,
    last_notified_at: toRegionIso(r.last_notified_at ? new Date(r.last_notified_at) : null),
  };
}

export function registerSubscriptionsApi(app: FastifyInstance, db: Db): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ["Подписки"];

  r.get(
    "/v1/subscriptions",
    {
      schema: {
        operationId: "listSubscriptions",
        tags,
        summary: "Свои подписки на город и категорию (дайджест новых событий)",
        response: { 200: SubscriptionList, 401: Problem },
      },
      // Подписки персонифицированы (X-Device-Id): общий кэш GET /v1 для них недопустим (MJ-11)
      onSend: async (_req, reply, payload) => {
        reply.header("Cache-Control", "private, no-store");
        return payload;
      },
    },
    async (req, reply) => {
      const profileId = await resolveProfile(db, req.headers);
      if (!profileId) return reply.code(401).send(unauthorized);
      const rows = (
        await db.execute<SubRow>(
          sql`SELECT id, title, query, last_notified_at, created_at FROM saved_search WHERE profile_id = ${profileId} ORDER BY created_at`,
        )
      ).rows;
      return { items: rows.map(toSubscription) };
    },
  );

  r.post(
    "/v1/subscriptions",
    {
      schema: {
        operationId: "createSubscription",
        tags,
        summary: "Подписаться на фильтр (нужен хотя бы один: город или категория)",
        body: SubscriptionCreate,
        response: { 201: Subscription, 400: Problem, 401: Problem },
      },
    },
    async (req, reply) => {
      const profileId = await resolveProfile(db, req.headers);
      if (!profileId) return reply.code(401).send(unauthorized);
      const municipality = req.body.municipality?.trim() || null;
      const categories = (req.body.categories ?? []) as CategoryCode[];
      if (!municipality && categories.length === 0)
        return reply.code(400).send(badRequest("Нужен хотя бы один фильтр: municipality или categories"));
      // город проверяем по справочнику, категории — enum из контракта
      let muniName: string | null = null;
      if (municipality) {
        const m = (
          await db.execute<{ name: string }>(
            sql`SELECT name->>'ru' AS name FROM municipality WHERE id = ${municipality}`,
          )
        ).rows[0];
        if (!m) return reply.code(400).send(badRequest(`Неизвестный город: ${municipality}`));
        muniName = m.name;
      }
      const filters: SubscriptionFilters = {
        municipality,
        categories,
        period: req.body.period ?? null,
      };
      const title = req.body.title?.trim() || subscriptionTitle(muniName, categories);
      const row = (
        await db.execute<SubRow>(sql`
          INSERT INTO saved_search (profile_id, title, query)
          VALUES (${profileId}, ${title}, ${JSON.stringify(filters)}::jsonb)
          RETURNING id, title, query, last_notified_at, created_at`)
      ).rows[0]!;
      return reply.code(201).send(toSubscription(row));
    },
  );

  r.delete(
    "/v1/subscriptions/:id",
    {
      schema: {
        operationId: "deleteSubscription",
        tags,
        summary: "Отписка: строка подписки удаляется целиком",
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null(), 401: Problem, 404: Problem },
      },
    },
    async (req, reply) => {
      const profileId = await resolveProfile(db, req.headers);
      if (!profileId) return reply.code(401).send(unauthorized);
      // чужая подписка не видна: WHERE по profile_id → 404, а не 403
      const deleted = (
        await db.execute<{ id: string }>(
          sql`DELETE FROM saved_search WHERE id = ${req.params.id} AND profile_id = ${profileId} RETURNING id`,
        )
      ).rows;
      if (deleted.length === 0)
        return reply.code(404).send({ type: "about:blank", title: "Подписка не найдена", status: 404 });
      return reply.code(204).send(null);
    },
  );
}
