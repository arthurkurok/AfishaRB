/**
 * Справочники и вспомогательные эндпоинты: учреждения и площадки с поиском (конструктор виджета),
 * «Похожие» и «Рядом в тот же день», публичные правила ранжирования (ст. 10.2-2 149-ФЗ), обратная связь.
 */
import {
  FeedbackRequest,
  Lang,
  OccurrenceCard,
  OrganizationRef,
  Problem,
  RankingRules,
  VenueListItem,
} from "@afisha/contract";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { report } from "../../db/schema.js";
import { getEventDetail } from "../catalog/index.js";
import { addDays, localParts } from "../geo/index.js";
import { RANKING_WEIGHTS, searchOccurrences } from "../search/index.js";

const UPCOMING = sql`o.status IN ('scheduled','sold_out','unverified') AND coalesce(o.ends_at, o.starts_at) >= now()`;
const like = (q?: string) => (q ? `%${q.toLowerCase().replaceAll("ё", "е")}%` : null);

export function registerDirectoryApi(app: FastifyInstance, db: Db): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const DirQuery = z.object({
    q: z.string().max(100).optional(),
    municipality: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  });

  r.get(
    "/v1/organizations",
    {
      schema: {
        operationId: "listOrganizations",
        tags: ["Справочники"],
        summary: "Учреждения культуры (поиск по названию, фильтр по муниципалитету)",
        querystring: DirQuery,
        response: { 200: z.array(OrganizationRef) },
      },
    },
    async (req) => {
      const q = like(req.query.q);
      const rows = (
        await db.execute<{ id: string; name: string; municipality: string | null; upcoming: number }>(sql`
          SELECT org.id, coalesce(org.short_name, org.name->>'ru') AS name, m.name->>'ru' AS municipality,
                 count(DISTINCT o.id)::int AS upcoming
          FROM organization org
          JOIN event e ON e.organization_id = org.id AND e.moderation_status = 'published'
          JOIN occurrence o ON o.event_id = e.id AND ${UPCOMING}
          LEFT JOIN municipality m ON m.id = o.municipality_id
          WHERE (${q}::text IS NULL OR lower(replace(coalesce(org.short_name, org.name->>'ru'), 'ё', 'е')) LIKE ${q})
            AND (${req.query.municipality ?? null}::text IS NULL OR o.municipality_id = ${req.query.municipality ?? null})
          GROUP BY org.id, m.name ORDER BY upcoming DESC LIMIT ${req.query.limit}`)
      ).rows;
      return rows;
    },
  );

  r.get(
    "/v1/venues",
    {
      schema: {
        operationId: "listVenues",
        tags: ["Справочники"],
        summary: "Площадки (поиск по названию, фильтр по муниципалитету)",
        querystring: DirQuery,
        response: { 200: z.array(VenueListItem) },
      },
    },
    async (req) => {
      const q = like(req.query.q);
      const rows = (
        await db.execute<Record<string, unknown>>(sql`
          SELECT v.id, v.name->>'ru' AS name, v.address, ST_Y(v.geo::geometry) AS lat, ST_X(v.geo::geometry) AS lon,
                 v.municipality_id, m.name->>'ru' AS municipality, coalesce(org.short_name, org.name->>'ru') AS organization,
                 count(o.id)::int AS upcoming
          FROM venue v
          LEFT JOIN municipality m ON m.id = v.municipality_id
          LEFT JOIN organization org ON org.id = v.organization_id
          JOIN occurrence o ON o.venue_id = v.id AND ${UPCOMING}
          WHERE (${q}::text IS NULL OR lower(replace(v.name->>'ru', 'ё', 'е')) LIKE ${q})
            AND (${req.query.municipality ?? null}::text IS NULL OR v.municipality_id = ${req.query.municipality ?? null})
          GROUP BY v.id, m.name, org.short_name, org.name ORDER BY upcoming DESC LIMIT ${req.query.limit}`)
      ).rows;
      return rows.map((v) => ({
        id: v.id as string,
        name: v.name as string,
        address: (v.address as string) ?? null,
        geo: v.lat !== null ? ([Number(v.lat), Number(v.lon)] as [number, number]) : null,
        municipality_id: (v.municipality_id as string) ?? null,
        municipality: (v.municipality as string) ?? null,
        organization: (v.organization as string) ?? null,
        upcoming: Number(v.upcoming),
      }));
    },
  );

  r.get(
    "/v1/events/:id/similar",
    {
      schema: {
        operationId: "similarEvents",
        tags: ["Афиша"],
        summary: "Похожие события (та же категория, тот же город) и «рядом в тот же день»",
        params: z.object({ id: z.uuid() }),
        querystring: z.object({ lang: Lang.optional() }),
        response: {
          200: z.object({ similar: z.array(OccurrenceCard), same_day_nearby: z.array(OccurrenceCard) }),
          404: Problem,
        },
      },
    },
    async (req, reply) => {
      const ev = await getEventDetail(db, req.params.id, req.query.lang);
      if (!ev) return reply.code(404).send({ type: "about:blank", title: "Событие не найдено", status: 404 });
      const occ = ev.occurrences.find((o) => o.status !== "ended") ?? ev.occurrences[0];
      const muni = occ?.venue?.municipality_id ?? undefined;
      const similar = await searchOccurrences(db, {
        categories: ev.categories.filter((c) => c !== "kids").slice(0, 1).length
          ? ev.categories.filter((c) => c !== "kids").slice(0, 1)
          : ev.categories,
        municipality: muni ? [muni] : undefined,
        when: "month",
        limit: 8,
        lang: req.query.lang,
      });
      let nearby: typeof similar.items = [];
      if (occ?.venue?.geo && !occ.is_range) {
        const day = localParts(new Date(occ.starts_at)).date;
        const res = await searchOccurrences(db, {
          near: `${occ.venue.geo[0]},${occ.venue.geo[1]}`,
          radius_km: 3,
          date_from: day,
          date_to: addDays(day, 0),
          limit: 8,
          lang: req.query.lang,
        });
        nearby = res.items;
      }
      const notSelf = (c: OccurrenceCard) => c.event.id !== ev.id;
      return {
        similar: similar.items.filter(notSelf).slice(0, 6),
        same_day_nearby: nearby.filter(notSelf).slice(0, 6),
      };
    },
  );

  r.get(
    "/v1/ranking-rules",
    {
      schema: {
        operationId: "rankingRules",
        tags: ["Справочники"],
        summary: "Правила применения рекомендательных технологий (ст. 10.2-2 149-ФЗ) — из тех же весов, что и поиск",
        response: { 200: RankingRules },
      },
    },
    async () => {
      const W = RANKING_WEIGHTS;
      return {
        updated_at: "2026-11-02",
        owner: process.env.AFISHA_OPERATOR_NAME ?? "Оператор сервиса «Афиша культуры Башкортостана» (уточняется)",
        contact_email: process.env.AFISHA_CONTACT_EMAIL ?? "afisha@example.ru",
        personalization: {
          enabled_by_default: false,
          how_to_disable:
            "Ранжирование не использует профиль пользователя; в боте — команда /nopersonal, в приложениях — переключатель в настройках.",
        },
        data_used: [
          "условия запроса: даты, город или геопозиция (только в момент запроса, не сохраняется), бюджет, возраст ребёнка, категории",
          "сведения о событии: название, описание, категория, дата и время, площадка, цена, возрастной знак, статус, полнота карточки",
        ],
        data_sources: [
          "PRO.Культура.РФ / Культура.РФ (открытые данные Минкультуры России)",
          "кабинеты учреждений культуры",
        ],
        factors: [
          {
            code: "text",
            title: "Совпадение с текстом запроса",
            weight: W.text,
            description: "Полнотекстовый поиск с русской морфологией и учётом опечаток",
          },
          {
            code: "time",
            title: "Близость по времени",
            weight: W.time,
            description: `Чем ближе начало, тем выше; вклад убывает с характерным временем ${W.timeDecayDays} дня`,
          },
          {
            code: "quality",
            title: "Полнота карточки",
            weight: W.quality,
            description: "Возраст, фото, описание, цена, ссылка на билеты, доступность, координаты",
          },
          {
            code: "distance",
            title: "Расстояние",
            weight: W.distance,
            description: `Только если передана геопозиция; убывает с масштабом ${W.distanceScaleM / 1000} км`,
          },
          {
            code: "unverified",
            title: "Информация уточняется",
            weight: W.unverified,
            description: "Событие пропало из источника — понижается и не попадает в подборки Гида",
          },
          {
            code: "sold_out",
            title: "Билетов нет",
            weight: W.soldOut,
            description: "Распроданные сеансы ниже доступных",
          },
          {
            code: "long_running",
            title: "Длительные события",
            weight: W.longRunning,
            description: "Выставки и экспозиции, идущие неделями, ниже сеансов на конкретное время",
          },
        ],
        diversification: "Сеансы одного события сворачиваются в одну карточку («ещё N дат»).",
        assistant:
          "ИИ-гид (GigaChat) понимает запрос и пишет короткие объяснения, но выбирает только из найденных по этим правилам событий; факты в объяснениях сверяются с карточкой.",
      };
    },
  );

  r.post(
    "/v1/feedback",
    {
      schema: {
        operationId: "sendFeedback",
        tags: ["Обратная связь"],
        summary: "Обратная связь, в том числе правка башкирского перевода",
        body: FeedbackRequest,
        response: { 202: z.object({ ok: z.boolean() }) },
      },
    },
    async (req, reply) => {
      await db.insert(report).values({
        reason: `feedback_${req.body.kind}`,
        comment: req.body.text,
        channel: String(req.headers["x-afisha-channel"] ?? "web"),
        context: {
          page: req.body.page ?? null,
          lang: req.body.lang ?? null,
          original: req.body.original ?? null,
          suggestion: req.body.suggestion ?? null,
        },
      });
      return reply.code(202).send({ ok: true });
    },
  );
}
