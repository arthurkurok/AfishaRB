/** Сборка Fastify-приложения (используется сервером, тестами и экспортом OpenAPI). */

import { createHash } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import Fastify, { type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { getDb } from "../db/client.js";
import { config, trustProxySetting } from "../lib/config.js";
import { metrics, registerMetrics } from "../lib/metrics.js";
import { registerAssistantApi } from "../modules/assistant/routes.js";
import { registerEngagementApi } from "../modules/engagement/index.js";
import { registerAdminApi } from "../modules/organizer/index.js";
import { registerDirectoryApi, registerPublicApi } from "../modules/publicapi/index.js";

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  // Явный generic — иначе TS выбирает перегрузку Http2SecureServer и типы «плывут»
  const app = Fastify<HttpServer>({
    // Журнал запросов: request-id, без секретов (MJ-14); в тестах — выключен
    logger:
      (opts.logger ?? config.AFISHA_ENV !== "test")
        ? {
            level: process.env.LOG_LEVEL ?? "info",
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              'req.headers["x-telegram-init-data"]',
              'req.headers["x-device-id"]',
            ],
          }
        : false,
    // По умолчанию адрес клиента — адрес сокета; X-Forwarded-For учитывается только от доверенного прокси (MJ-17)
    trustProxy: trustProxySetting(config.AFISHA_TRUST_PROXY),
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: config.AFISHA_CORS_ORIGINS === "*" ? true : config.AFISHA_CORS_ORIGINS.split(",").map((s) => s.trim()),
  });
  // Лимиты по плану (docs/04-architecture.md §8.1): 60 запросов в минуту с адреса без ключа.
  // Для Гида и ИИ-черновиков — отдельные, более строгие лимиты на маршрутах.
  await app.register(rateLimit, {
    max: 60,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctx) => ({
      type: "about:blank",
      title: "Слишком много запросов",
      status: 429,
      detail: `Лимит ${ctx.max} запросов в минуту`,
    }),
  });
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Афиша культуры Башкортостана — открытый API",
        version: "1.0.0",
        description:
          "Достоверные культурные события Республики Башкортостан: поиск, паспорт события с источниками и историей изменений, справочники, фиды. Даты — в часовом поясе региона (+05:00). Ошибки — RFC 9457 (application/problem+json). Лимит без ключа — 60 запросов в минуту.",
        license: {
          name: "Данные: типовые условия использования открытых данных РФ; изображения — по лицензии правообладателей",
          url: "http://data.gov.ru/information-usage",
        },
      },
      servers: [{ url: config.AFISHA_API_BASE_URL }],
      tags: [
        { name: "Афиша", description: "Поиск и карточки событий" },
        { name: "Справочники" },
        { name: "Гид", description: "ИИ-гид на GigaChat" },
        { name: "Фиды" },
        { name: "Обратная связь" },
        {
          name: "Избранное",
          description: "Без регистрации: заголовок X-Device-Id (приложения, сайт) или X-Telegram-Init-Data (Mini App)",
        },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(scalar, { routePrefix: "/docs", configuration: { title: "API · Афиша культуры РБ" } });

  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; validation?: unknown; code?: string };
    const status = e.statusCode ?? (e.code === "FST_ERR_VALIDATION" || e.validation ? 400 : 500);
    if (status >= 500) {
      req.log.error({ err: e }, "request.failed");
      metrics.serverErrors++;
    }
    reply
      .code(status)
      .type("application/problem+json")
      .send({
        type: "about:blank",
        title: status >= 500 ? "Внутренняя ошибка" : status === 400 ? "Некорректный запрос" : e.message,
        status,
        ...(status === 400 ? { detail: e.message.slice(0, 500) } : {}),
        instance: req.id,
      });
  });

  // Кэширование публичных GET на CDN и в браузере + ETag (docs/04-architecture.md §8.2, MJ-11)
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.method !== "GET" || reply.statusCode !== 200) return payload;
    const url = req.routeOptions.url ?? "";
    if (!(url.startsWith("/v1/") || url.startsWith("/feeds/"))) return payload;
    if (url.startsWith("/v1/assistant")) return payload;
    const body = typeof payload === "string" || Buffer.isBuffer(payload) ? payload : null;
    if (!body) return payload;
    const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`;
    reply.header("ETag", etag);
    reply.header(
      "Cache-Control",
      url.startsWith("/feeds/") ? "public, max-age=900" : "public, max-age=60, stale-while-revalidate=300",
    );
    if (req.headers["if-none-match"] === etag) {
      reply.code(304);
      return "";
    }
    return payload;
  });

  app.get("/health", { schema: { hide: true } }, async () => ({ ok: true }));
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  const db = getDb();
  registerMetrics(app, db);
  registerPublicApi(app, db);
  registerDirectoryApi(app, db);
  registerEngagementApi(app, db);
  registerAssistantApi(app, db);
  registerAdminApi(app, db);
  return app;
}
