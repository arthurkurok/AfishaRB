/** Избранное без регистрации: устройство или Telegram Mini App. Подписка на изменения — через избранное (ADR-015). */
import { FavoriteList, Problem } from "@afisha/contract";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { resolveProfile } from "../accounts/index.js";
import { addDays, todayLocal } from "../geo/index.js";
import { searchOccurrences } from "../search/index.js";

const unauthorized = {
  type: "about:blank",
  title: "Нужен заголовок X-Device-Id или X-Telegram-Init-Data",
  status: 401,
};

export function registerEngagementApi(app: FastifyInstance, db: Db): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ["Избранное"];

  r.get(
    "/app/favorites",
    {
      schema: {
        operationId: "listFavorites",
        tags,
        summary: "Избранное с ближайшими сеансами",
        response: { 200: FavoriteList, 401: Problem },
      },
    },
    async (req, reply) => {
      const profileId = await resolveProfile(db, req.headers);
      if (!profileId) return reply.code(401).send(unauthorized);
      const ids = (
        await db.execute<{ event_id: string }>(
          sql`SELECT event_id FROM favorite WHERE profile_id = ${profileId} ORDER BY created_at DESC`,
        )
      ).rows.map((x) => x.event_id);
      if (ids.length === 0) return { event_ids: [], items: [] };
      // Ближайший актуальный сеанс каждого события — тем же поиском, что и во всех каналах
      const res = await searchOccurrences(db, {
        events: ids.slice(0, 100),
        date_to: addDays(todayLocal(), 180),
        limit: 100,
        sort: "date",
      });
      return { event_ids: ids, items: res.items };
    },
  );

  r.put(
    "/app/favorites/:eventId",
    {
      schema: {
        operationId: "addFavorite",
        tags,
        summary: "Добавить в избранное (и получать уведомления об изменениях)",
        params: z.object({ eventId: z.uuid() }),
        response: { 204: z.null(), 401: Problem },
      },
    },
    async (req, reply) => {
      const profileId = await resolveProfile(db, req.headers);
      if (!profileId) return reply.code(401).send(unauthorized);
      await db.execute(
        sql`INSERT INTO favorite (profile_id, event_id) VALUES (${profileId}, ${req.params.eventId}) ON CONFLICT DO NOTHING`,
      );
      return reply.code(204).send(null);
    },
  );

  r.delete(
    "/app/favorites/:eventId",
    {
      schema: {
        operationId: "removeFavorite",
        tags,
        summary: "Убрать из избранного",
        params: z.object({ eventId: z.uuid() }),
        response: { 204: z.null(), 401: Problem },
      },
    },
    async (req, reply) => {
      const profileId = await resolveProfile(db, req.headers);
      if (!profileId) return reply.code(401).send(unauthorized);
      await db.execute(sql`DELETE FROM favorite WHERE profile_id = ${profileId} AND event_id = ${req.params.eventId}`);
      return reply.code(204).send(null);
    },
  );
}
