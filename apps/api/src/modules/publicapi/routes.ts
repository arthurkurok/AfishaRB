/** Публичный API v1 (docs/04-architecture.md §8). Без ключа — 60 запросов в минуту с IP. */
import {
  Category,
  EventDetail,
  Lang,
  Municipality,
  Problem,
  ReportRequest,
  SearchQuery,
  SearchResult,
  Stats,
  VenueDetail,
} from "@afisha/contract";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { report, searchLog } from "../../db/schema.js";
import { config } from "../../lib/config.js";
import { maskPii } from "../assistant/index.js";
import { catalogStats, getEventDetail, getVenueRow, listCategories, listMunicipalities } from "../catalog/index.js";
import { searchOccurrences } from "../search/index.js";
import { toIcal, toRss } from "./feeds.js";

const LangQuery = z.object({ lang: Lang.optional() });

export function registerPublicApi(app: FastifyInstance, db: Db): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/v1/occurrences",
    {
      schema: {
        operationId: "searchOccurrences",
        tags: ["Афиша"],
        summary: "Поиск сеансов с фильтрами (дата, город, цена, возраст, категория…)",
        querystring: SearchQuery,
        response: { 200: SearchResult },
      },
    },
    async (req) => {
      const res = await searchOccurrences(db, req.query);
      void db
        .insert(searchLog)
        .values({
          channel: String(req.headers["x-afisha-channel"] ?? "api"),
          queryText: req.query.q ? maskPii(req.query.q) : null, // ПДн в журнал не пишем (MJ-19)
          filters: { ...req.query, q: undefined, cursor: undefined },
          municipalityId: req.query.municipality?.[0] ?? null,
          results: res.total,
        })
        .catch(() => undefined);
      return res;
    },
  );

  r.get(
    "/v1/events/:id",
    {
      schema: {
        operationId: "getEvent",
        tags: ["Афиша"],
        summary: "Паспорт события: описание, сеансы, источники, история изменений",
        params: z.object({ id: z.uuid() }),
        querystring: LangQuery,
        response: { 200: EventDetail, 404: Problem },
      },
    },
    async (req, reply) => {
      const ev = await getEventDetail(db, req.params.id, req.query.lang);
      if (!ev) return reply.code(404).send({ type: "about:blank", title: "Событие не найдено", status: 404 });
      return ev;
    },
  );

  r.get(
    "/v1/venues/:id",
    {
      schema: {
        operationId: "getVenue",
        tags: ["Афиша"],
        summary: "Площадка: адрес, координаты, доступность, ближайшие события",
        params: z.object({ id: z.uuid() }),
        querystring: LangQuery,
        response: { 200: VenueDetail, 404: Problem },
      },
    },
    async (req, reply) => {
      const v = await getVenueRow(db, req.params.id, req.query.lang);
      if (!v) return reply.code(404).send({ type: "about:blank", title: "Площадка не найдена", status: 404 });
      const upcoming = await searchOccurrences(db, {
        venue: req.params.id,
        when: "month",
        limit: 30,
        sort: "date",
        lang: req.query.lang,
      });
      return { ...v, upcoming: upcoming.items, upcoming_total: upcoming.total };
    },
  );

  r.get(
    "/v1/categories",
    {
      schema: {
        operationId: "listCategories",
        tags: ["Справочники"],
        summary: "Категории и число событий",
        querystring: LangQuery,
        response: { 200: z.array(Category) },
      },
    },
    async (req) => listCategories(db, req.query.lang),
  );

  r.get(
    "/v1/municipalities",
    {
      schema: {
        operationId: "listMunicipalities",
        tags: ["Справочники"],
        summary: "Муниципалитеты РБ (54 района и 9 городских округов) с числом предстоящих сеансов",
        querystring: LangQuery,
        response: { 200: z.array(Municipality) },
      },
    },
    async (req) => listMunicipalities(db, req.query.lang),
  );

  r.get(
    "/v1/stats",
    {
      schema: {
        operationId: "getStats",
        tags: ["Справочники"],
        summary: "Размер и свежесть каталога",
        response: { 200: Stats },
      },
    },
    async () => catalogStats(db),
  );

  r.post(
    "/v1/reports",
    {
      schema: {
        operationId: "createReport",
        tags: ["Обратная связь"],
        summary: "Сообщить о неточности в событии (попадает в очередь модерации)",
        body: ReportRequest,
        response: { 202: z.object({ ok: z.boolean() }) },
      },
    },
    async (req, reply) => {
      await db.insert(report).values({ ...req.body, channel: String(req.headers["x-afisha-channel"] ?? "api") });
      return reply.code(202).send({ ok: true });
    },
  );

  r.get(
    "/feeds/ical",
    {
      schema: {
        operationId: "icalFeed",
        tags: ["Фиды"],
        summary: "Подписка на афишу в календаре (iCal) по любым фильтрам поиска",
        querystring: SearchQuery,
      },
    },
    async (req, reply) => {
      const res = await searchOccurrences(db, { ...req.query, limit: 100, group: false });
      reply.header("content-type", "text/calendar; charset=utf-8");
      return toIcal(res.items, "Афиша культуры Башкортостана", config.AFISHA_PUBLIC_BASE_URL);
    },
  );

  r.get(
    "/feeds/rss",
    {
      schema: {
        operationId: "rssFeed",
        tags: ["Фиды"],
        summary: "RSS по фильтрам поиска (для СМИ и пабликов)",
        querystring: SearchQuery,
      },
    },
    async (req, reply) => {
      const res = await searchOccurrences(db, { ...req.query, limit: 50 });
      reply.header("content-type", "application/rss+xml; charset=utf-8");
      return toRss(res.items, "Афиша культуры Башкортостана", config.AFISHA_PUBLIC_BASE_URL);
    },
  );
}
