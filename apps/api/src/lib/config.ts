/** Конфигурация из окружения (префикс AFISHA_). Валидируется zod при старте. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

function loadDotEnv(): void {
  const path = resolve(REPO_ROOT, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]?.replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const Env = z.object({
  AFISHA_ENV: z.string().default("dev"),
  AFISHA_DATABASE_URL: z.string().default("postgres://afisha:afisha@localhost:55432/afisha"),
  AFISHA_VALKEY_URL: z.string().default("redis://localhost:56379/0"),
  AFISHA_DATA_DIR: z.string().default(resolve(REPO_ROOT, "data")),
  AFISHA_REGION: z.string().default("ba"),
  AFISHA_REGION_TZ: z.string().default("Asia/Yekaterinburg"),
  AFISHA_PORT: z.coerce.number().default(8000),
  AFISHA_PUBLIC_BASE_URL: z.string().default("http://localhost:3000"),
  AFISHA_API_BASE_URL: z.string().default("http://localhost:8000"),
  AFISHA_CORS_ORIGINS: z.string().default("*"),
  /** Один токен министерства (dev: dev-admin-token). В проде — ≥ 32 символов или AFISHA_ADMIN_TOKENS. */
  AFISHA_ADMIN_TOKEN: z.string().optional(),
  /** JSON-массив субъектов: [{"token","name","role":"ministry"|"organization","organization_id"?}] */
  AFISHA_ADMIN_TOKENS: z.string().optional(),
  /** Секрет для HMAC (обезличивание идентификаторов в журналах). В проде обязателен, ≥ 32 символов. */
  AFISHA_SECRET: z.string().default("dev-secret-not-for-production-use-0000"),
  /** Доверенный прокси: false (по умолчанию — адрес сокета), число хопов или CIDR ингресса. */
  AFISHA_TRUST_PROXY: z.string().default("false"),
  // GigaChat — API Сбера
  AFISHA_GIGACHAT_CREDENTIALS: z.string().optional(),
  AFISHA_GIGACHAT_SCOPE: z.string().default("GIGACHAT_API_PERS"),
  AFISHA_GIGACHAT_BASE_URL: z.string().default("https://api.giga.chat/v1"),
  AFISHA_GIGACHAT_AUTH_URL: z.string().default("https://ngw.devices.sberbank.ru:9443/api/v2/oauth"),
  AFISHA_GIGACHAT_CA_FILE: z.string().optional(),
  AFISHA_GIGACHAT_INSECURE: bool,
  AFISHA_GIGACHAT_MODEL_FAST: z.string().default("GigaChat-2"),
  AFISHA_GIGACHAT_MODEL_SMART: z.string().default("GigaChat-2-Pro"),
  AFISHA_GIGACHAT_EMBEDDINGS_MODEL: z.string().default("EmbeddingsGigaR"),
  // GigaChat — cloud.ru Evolution Foundation Models (OpenAI-совместимый)
  AFISHA_CLOUDRU_API_KEY: z.string().optional(),
  AFISHA_CLOUDRU_BASE_URL: z.string().default("https://foundation-models.api.cloud.ru/v1"),
  AFISHA_CLOUDRU_MODEL_FAST: z.string().default("ai-sage/GigaChat3-10B-A1.8B"),
  AFISHA_CLOUDRU_MODEL_SMART: z.string().default("ai-sage/GigaChat3-Pro"),
  AFISHA_AI_MAX_PARALLEL: z.coerce.number().default(8),
  AFISHA_AI_DAILY_TOKEN_BUDGET: z.coerce.number().default(3_000_000),
  AFISHA_AI_DISABLED: bool,
  // Лимиты стоимости ИИ (ТЗ 6.5): рубли считаются по токенам, цены — за 1 млн токенов
  AFISHA_AI_DIALOG_COST_LIMIT_RUB: z.coerce
    .number()
    .default(5)
    .describe("Максимальная стоимость одного диалога с Гидом, ₽"),
  AFISHA_AI_USER_DAILY_COST_RUB: z.coerce
    .number()
    .default(50)
    .describe("Дневной лимит стоимости ИИ на пользователя, ₽"),
  AFISHA_AGENT_MAX_STEPS: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Максимум вызовов инструментов агента на один ответ"),
  AFISHA_AI_PRICE_FAST_RUB_PER_1M: z.coerce
    .number()
    .default(200)
    .describe("Цена быстрой модели (GigaChat-2), ₽ за 1 млн токенов"),
  AFISHA_AI_PRICE_SMART_RUB_PER_1M: z.coerce
    .number()
    .default(1200)
    .describe("Цена умной модели (GigaChat-2-Pro), ₽ за 1 млн токенов"),
  // Telegram

  AFISHA_TELEGRAM_BOT_TOKEN: z.string().optional(),
  AFISHA_TELEGRAM_PROXY: z.string().optional(),
  AFISHA_TELEGRAM_WEBAPP_URL: z.string().optional(),
});

export type Config = z.infer<typeof Env>;

const DEV_ADMIN_TOKEN = "dev-admin-token";

/** Проверки безопасности конфигурации: в проде сервис не стартует с небезопасными настройками (MJ-16). */
export function validateConfig(c: Config): string[] {
  const problems: string[] = [];
  if (c.AFISHA_ENV !== "prod") return problems;
  if (!c.AFISHA_ADMIN_TOKEN && !c.AFISHA_ADMIN_TOKENS)
    problems.push("не задан AFISHA_ADMIN_TOKEN или AFISHA_ADMIN_TOKENS");
  if (c.AFISHA_ADMIN_TOKEN && (c.AFISHA_ADMIN_TOKEN === DEV_ADMIN_TOKEN || c.AFISHA_ADMIN_TOKEN.length < 32))
    problems.push("AFISHA_ADMIN_TOKEN — значение по умолчанию или короче 32 символов");
  if (c.AFISHA_SECRET.startsWith("dev-") || c.AFISHA_SECRET.length < 32)
    problems.push("AFISHA_SECRET не задан или короче 32 символов");
  if (c.AFISHA_GIGACHAT_INSECURE) problems.push("AFISHA_GIGACHAT_INSECURE запрещён в проде (проверка TLS обязательна)");
  if (c.AFISHA_CORS_ORIGINS.trim() === "*")
    problems.push("AFISHA_CORS_ORIGINS=* запрещён в проде — перечислите домены");
  if (/\/\/afisha:afisha@/.test(c.AFISHA_DATABASE_URL)) problems.push("учётные данные БД по умолчанию");
  return problems;
}

const parsed = Env.parse(process.env);
// Удобство разработки: в dev без явного токена работает dev-admin-token
if (parsed.AFISHA_ENV !== "prod" && !parsed.AFISHA_ADMIN_TOKEN && !parsed.AFISHA_ADMIN_TOKENS)
  parsed.AFISHA_ADMIN_TOKEN = DEV_ADMIN_TOKEN;
const configProblems = validateConfig(parsed);
if (configProblems.length) {
  throw new Error(`Небезопасная конфигурация для AFISHA_ENV=prod:\n- ${configProblems.join("\n- ")}`);
}
export const config: Config = parsed;

/** trustProxy для Fastify из строки окружения. Число хопов превращается в предикат (Fastify 5 не принимает number). */
export function trustProxySetting(v: string): boolean | string | string[] | ((addr: string, hops: number) => boolean) {
  if (v === "false" || v === "") return false;
  if (v === "true") return true;
  if (/^\d+$/.test(v)) {
    const hops = Number(v);
    return (_addr: string, h: number) => h <= hops;
  }
  return v; // CIDR/список адресов ингресса
}
