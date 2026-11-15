/**
 * Админ-API: кабинет учреждения, модерация, «Пульс культуры» (docs/03-functional-spec.md §7–9).
 * Инкапсулированный плагин с префиксом /admin: проверка доступа привязана к найденному маршруту,
 * поэтому обходы через кодирование пути (/%61dmin, /adm%69n) невозможны (BL-7).
 * Маршруты скрыты из публичной спецификации; веб-админка использует типы из packages/contract.
 */
import { CabinetEventCreate } from "@afisha/contract";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { dashboard } from "../analytics/index.js";
import { mergeEvents, recordDistinct, unmergeEvent } from "../dedup/index.js";
import { ImportBody, ImportFormatError, importFile, parseMultipart } from "../ingestion/index.js";
import { actorOf, authenticate, isMinistry, type Principal } from "./auth.js";
import { createCabinetEvent } from "./create-event.js";
import { extractDraft } from "./extract.js";
import { listModerationTasks, resolveVanished } from "./moderation.js";
import { changeOccurrenceStatus, StatusChangeError } from "./status.js";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

const problem = (status: number, title: string) => ({ type: "about:blank", title, status });
const forbidden = (reply: FastifyReply) => reply.code(403).send(problem(403, "Недостаточно прав"));
const ministryOnly = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.principal || !isMinistry(req.principal)) return forbidden(reply);
};

export function registerAdminApi(app: FastifyInstance, db: Db): void {
  app.register(
    async (admin) => {
      admin.addHook("onRequest", async (req, reply) => {
        const principal = authenticate(req.headers.authorization);
        if (!principal) return reply.code(401).send(problem(401, "Нужна авторизация"));
        req.principal = principal;
      });
      const r = admin.withTypeProvider<ZodTypeProvider>();
      const base = { hide: true, tags: ["Кабинет и министерство"] };

      r.post(
        "/occurrences/:id/status",
        {
          schema: {
            ...base,
            operationId: "changeOccurrenceStatus",
            summary: "Изменить статус сеанса (отмена, перенос, распродано) — подписчики получат уведомление",
            params: z.object({ id: z.uuid() }),
            body: z.object({
              status: z.enum(["scheduled", "cancelled", "rescheduled", "postponed", "sold_out"]),
              reason: z.string().max(300).optional(),
              new_starts_at: z.string().datetime({ offset: true }).optional(),
            }),
          },
        },
        async (req, reply) => {
          const p = req.principal!;
          const owner = (
            await db.execute<{ organization_id: string | null }>(
              sql`SELECT e.organization_id FROM occurrence o JOIN event e ON e.id = o.event_id WHERE o.id = ${req.params.id}`,
            )
          ).rows[0];
          if (!owner) return reply.code(404).send(problem(404, "Сеанс не найден"));
          if (!isMinistry(p) && owner.organization_id !== p.organizationId) return forbidden(reply);
          try {
            const res = await changeOccurrenceStatus(db, {
              occurrenceId: req.params.id,
              status: req.body.status,
              reason: req.body.reason ?? null,
              newStartsAt: req.body.new_starts_at ? new Date(req.body.new_starts_at) : null,
              actor: actorOf(p),
              sourceId: isMinistry(p) ? "moderator" : "organizer_cabinet",
            });
            return { ok: true, ...res };
          } catch (err) {
            if (err instanceof StatusChangeError)
              return reply.code(err.httpStatus).send(problem(err.httpStatus, err.message));
            throw err;
          }
        },
      );

      r.post(
        "/events",
        {
          schema: {
            ...base,
            operationId: "createCabinetEvent",
            summary: "Создать событие из кабинета учреждения (официальный источник, публикуется сразу)",
            body: CabinetEventCreate,
          },
        },
        async (req, reply) => {
          const p = req.principal!;
          if (!isMinistry(p) && req.body.organization_id !== p.organizationId) return forbidden(reply);
          const res = await createCabinetEvent(db, req.body, actorOf(p));
          if ("error" in res) return reply.code(res.status).send(problem(res.status, res.error));
          return reply.code(201).send(res);
        },
      );

      r.post(
        "/events/extract",
        {
          config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
          schema: {
            ...base,
            operationId: "extractEventDraft",
            summary: "ИИ-помощник: черновик карточки из текста анонса или поста VK",
            body: z.object({ text: z.string().min(10).max(8000) }),
          },
        },
        async (req) => extractDraft(req.body.text),
      );

      // ---------- Импорт файла (уровень 1+, ТЗ 6.1) ----------
      // multipart разбираем сами (без зависимости @fastify/multipart): нужны только поле file и его имя
      admin.register(async (scope) => {
        scope.addContentTypeParser("multipart/form-data", { parseAs: "buffer" }, (_req, body, done) => {
          done(null, body);
        });
        scope.post(
          "/import",
          {
            preHandler: ministryOnly,
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            bodyLimit: 10 * 1024 * 1024,
            schema: {
              ...base,
              operationId: "importFile",
              summary: "Импорт событий из CSV/JSON (только министерство): multipart с полем file или JSON {content}",
            },
          },
          async (req, reply) => {
            const ctype = String(req.headers["content-type"] ?? "");
            let content: string | unknown[];
            let filename: string | null = null;
            let dryRun = false;
            if (ctype.startsWith("multipart/form-data")) {
              if (!Buffer.isBuffer(req.body))
                return reply.code(400).send(problem(400, "Не удалось прочитать multipart-тело"));
              const parts = parseMultipart(req.body, ctype);
              const file = parts.get("file");
              if (!file) return reply.code(400).send(problem(400, "В форме нет поля file"));
              content = file.data.toString("utf8");
              filename = file.filename;
              const flag = parts.get("dry_run")?.data.toString("utf8").trim().toLowerCase();
              dryRun = flag === "true" || flag === "1" || flag === "да";
            } else {
              const parsed = ImportBody.safeParse(req.body);
              if (!parsed.success)
                return reply
                  .code(400)
                  .send(problem(400, "Ожидается multipart/form-data с полем file или JSON {content}"));
              content = parsed.data.content;
              filename = parsed.data.filename ?? null;
              dryRun = parsed.data.dry_run === true;
            }
            try {
              return await importFile(db, { content, filename, dryRun });
            } catch (err) {
              if (err instanceof ImportFormatError) return reply.code(400).send(problem(400, err.message));
              throw err;
            }
          },
        );
      });

      // ---------- Только министерство ----------
      r.get(
        "/moderation/tasks",
        {
          preHandler: ministryOnly,
          schema: {
            ...base,
            operationId: "listModerationTasks",
            summary: "Очередь модерации",
            querystring: z.object({
              kind: z.string().max(32).optional(),
              state: z.enum(["open", "done", "dismissed"]).default("open"),
              limit: z.coerce.number().int().min(1).max(1000).default(500),
            }),
          },
        },
        async (req) => listModerationTasks(db, req.query),
      );

      r.post(
        "/moderation/tasks/:id/resolve",
        {
          preHandler: ministryOnly,
          schema: {
            ...base,
            operationId: "resolveModerationTask",
            summary: "Решение по задаче: объединить дубли / это разные события / подтвердить / отменить / отложить",
            params: z.object({ id: z.uuid() }),
            body: z.object({
              action: z.enum(["merge", "distinct", "dismiss", "confirm", "cancel"]),
              scope: z
                .enum(["task", "event"])
                .default("task")
                .describe("event — то же решение для всех открытых задач «исчезнувший сеанс» этого события"),
            }),
          },
        },
        async (req, reply) => {
          const actor = actorOf(req.principal!);
          const task = (
            await db.execute<{ id: string; kind: string; entity_id: string; related_id: string | null; state: string }>(
              sql`SELECT id, kind, entity_id, related_id, state FROM moderation_task WHERE id = ${req.params.id}`,
            )
          ).rows[0];
          if (!task) return reply.code(404).send(problem(404, "Задача не найдена"));
          if (task.state !== "open") return reply.code(409).send(problem(409, "Задача уже закрыта"));
          const a = req.body.action;
          if ((a === "merge" || a === "distinct") && task.kind !== "dedup_review")
            return reply.code(400).send(problem(400, "«Объединить» и «разные события» — только для возможных дублей"));
          if ((a === "confirm" || a === "cancel") && task.kind !== "vanished")
            return reply.code(400).send(problem(400, "«Подтвердить» и «отменить» — только для исчезнувших сеансов"));
          if (task.kind === "dedup_review" && task.related_id) {
            if (a === "merge")
              await mergeEvents(db, task.entity_id, task.related_id, { actor, reason: "Объединено модератором" });
            if (a === "distinct") await recordDistinct(db, task.entity_id, task.related_id, actor);
          }
          if (task.kind === "vanished" && (a === "confirm" || a === "cancel")) {
            const res = await resolveVanished(db, task.id, a, req.body.scope, actor);
            if ("error" in res) return reply.code(409).send(problem(409, res.error));
            return { ok: true, resolved: res.resolved };
          }
          await db.execute(
            sql`UPDATE moderation_task SET state = ${a === "dismiss" ? "dismissed" : "done"}, resolution = ${a}, resolved_by = ${actor}, updated_at = now()
                WHERE id = ${req.params.id} AND state = 'open'`,
          );
          return { ok: true, resolved: 1 };
        },
      );

      r.post(
        "/events/:id/unmerge",
        {
          preHandler: ministryOnly,
          schema: {
            ...base,
            operationId: "unmergeEvent",
            summary: "Разъединить ошибочно слитое событие (решение запоминается: «никогда не сливать»)",
            params: z.object({ id: z.uuid() }),
          },
        },
        async (req, reply) => {
          const res = await unmergeEvent(db, req.params.id, actorOf(req.principal!));
          if (!res) return reply.code(404).send(problem(404, "Событие не было слито"));
          return { ok: true, ...res };
        },
      );

      r.get(
        "/dashboard",
        {
          preHandler: ministryOnly,
          schema: {
            ...base,
            operationId: "getDashboard",
            summary: "«Пульс культуры»: предложение, спрос, спрос без предложения, качество данных",
            querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
          },
        },
        async (req) => dashboard(db, req.query.days),
      );

      r.get(
        "/reports",
        {
          preHandler: ministryOnly,
          schema: { ...base, operationId: "listReports", summary: "Жалобы и обратная связь" },
        },
        async () =>
          (
            await db.execute(
              sql`SELECT r.*, e.title->>'ru' AS title FROM report r LEFT JOIN event e ON e.id = r.event_id ORDER BY r.created_at DESC LIMIT 200`,
            )
          ).rows,
      );

      r.get("/me", { schema: { ...base, operationId: "whoAmI", summary: "Текущий субъект" } }, async (req) => ({
        name: req.principal!.name,
        role: req.principal!.role,
        organization_id: req.principal!.organizationId,
      }));
    },
    { prefix: "/admin" },
  );
}
