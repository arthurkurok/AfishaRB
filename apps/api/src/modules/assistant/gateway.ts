/**
 * AI Gateway — единственная точка вызова GigaChat (docs/05-ai-agent.md §3.1).
 * Провайдеры: API Сбера (OAuth, function calling) и cloud.ru (OpenAI-совместимый).
 * Семафор параллельности, дневной бюджет токенов, ретраи, обработка blacklist/402/429, каскад провайдеров.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { Agent, fetch as ufetch } from "undici";
import { config } from "../../lib/config.js";
import { log } from "../../lib/log.js";

export type Tier = "fast" | "smart";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type JsonSchemaSpec = { name: string; description: string; schema: Record<string, unknown> };
export type ChatRequest = {
  tier: Tier;
  messages: ChatMessage[];
  json?: JsonSchemaSpec;
  temperature?: number;
  maxTokens?: number;
  sessionId?: string;
};
export type ChatResult = {
  content: string | null;
  json: unknown;
  finishReason: string;
  model: string;
  provider: "sber" | "cloudru";
  tokensIn: number;
  tokensOut: number;
  ms: number;
};

export class AiUnavailableError extends Error {}
export class AiBlacklistError extends Error {}

interface Provider {
  readonly name: "sber" | "cloudru";
  chat(req: ChatRequest): Promise<Omit<ChatResult, "ms">>;
  embed?(texts: string[]): Promise<number[][]>;
}

class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    return () => {
      this.active--;
      this.waiters.shift()?.();
    };
  }
}

/* ---------- API Сбера ---------- */
class SberProvider implements Provider {
  readonly name = "sber" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly dispatcher: Agent;

  constructor(private readonly credentials: string) {
    const ca = config.AFISHA_GIGACHAT_CA_FILE ? readFileSync(config.AFISHA_GIGACHAT_CA_FILE) : undefined;
    // Корень НУЦ Минцифры передаётся как дополнительный CA; проверка TLS не отключается без явного флага
    this.dispatcher = new Agent({ connect: { ca, rejectUnauthorized: !config.AFISHA_GIGACHAT_INSECURE } });
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt - Date.now() > 5 * 60_000) return this.token.value;
    const res = await ufetch(config.AFISHA_GIGACHAT_AUTH_URL, {
      method: "POST",
      dispatcher: this.dispatcher,
      headers: {
        Authorization: `Basic ${this.credentials}`,
        RqUID: randomUUID(),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: `scope=${encodeURIComponent(config.AFISHA_GIGACHAT_SCOPE)}`,
    });
    if (!res.ok) throw new AiUnavailableError(`GigaChat OAuth: HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_at: number };
    this.token = { value: body.access_token, expiresAt: body.expires_at };
    return body.access_token;
  }

  private async post(path: string, payload: unknown, sessionId?: string): Promise<Record<string, any>> {
    const token = await this.accessToken();
    const res = await ufetch(`${config.AFISHA_GIGACHAT_BASE_URL}${path}`, {
      method: "POST",
      dispatcher: this.dispatcher,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "AfishaRB/1.0",
        ...(sessionId ? { "X-Session-ID": sessionId } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) this.token = null;
    if (res.status === 402) throw new AiUnavailableError("GigaChat: закончились токены (402)");
    if (res.status === 429) throw new AiUnavailableError("GigaChat: превышен лимит потоков (429)");
    if (!res.ok) throw new AiUnavailableError(`GigaChat: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as Record<string, any>;
  }

  async chat(req: ChatRequest) {
    const model = req.tier === "fast" ? config.AFISHA_GIGACHAT_MODEL_FAST : config.AFISHA_GIGACHAT_MODEL_SMART;
    // Системное сообщение — одно и первым (иначе 422); структурный ответ — через вызов функции
    const payload: Record<string, unknown> = {
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 800,
    };
    if (req.json) {
      payload.functions = [{ name: req.json.name, description: req.json.description, parameters: req.json.schema }];
      payload.function_call = { name: req.json.name };
    }
    const body = await this.post("/chat/completions", payload, req.sessionId);
    const choice = body.choices?.[0];
    const finishReason = String(choice?.finish_reason ?? "stop");
    if (finishReason === "blacklist") throw new AiBlacklistError("GigaChat отказался отвечать (blacklist)");
    const fc = choice?.message?.function_call;
    let json: unknown = null;
    if (fc?.arguments) json = typeof fc.arguments === "string" ? JSON.parse(fc.arguments) : fc.arguments;
    else if (req.json && choice?.message?.content) json = tryParseJson(choice.message.content);
    return {
      content: (choice?.message?.content as string) ?? null,
      json,
      finishReason,
      model,
      provider: this.name,
      tokensIn: Number(body.usage?.prompt_tokens ?? 0) - Number(body.usage?.precached_prompt_tokens ?? 0),
      tokensOut: Number(body.usage?.completion_tokens ?? 0),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const body = await this.post("/embeddings", { model: config.AFISHA_GIGACHAT_EMBEDDINGS_MODEL, input: texts });
    return (body.data as { embedding: number[] }[]).map((d) => d.embedding);
  }
}

/* ---------- cloud.ru (OpenAI-совместимый) ---------- */
class CloudRuProvider implements Provider {
  readonly name = "cloudru" as const;
  private readonly client: OpenAI;
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, baseURL: config.AFISHA_CLOUDRU_BASE_URL, timeout: 30_000, maxRetries: 1 });
  }
  async chat(req: ChatRequest) {
    const model = req.tier === "fast" ? config.AFISHA_CLOUDRU_MODEL_FAST : config.AFISHA_CLOUDRU_MODEL_SMART;
    const res = await this.client.chat.completions.create({
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? 800,
      ...(req.json
        ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: req.json.name, schema: req.json.schema, strict: true },
            },
          }
        : {}),
    });
    const choice = res.choices[0];
    const content = choice?.message?.content ?? null;
    return {
      content,
      json: req.json && content ? tryParseJson(content) : null,
      finishReason: String(choice?.finish_reason ?? "stop"),
      model,
      provider: this.name,
      tokensIn: res.usage?.prompt_tokens ?? 0,
      tokensOut: res.usage?.completion_tokens ?? 0,
    };
  }
}

function tryParseJson(s: string): unknown {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/* ---------- Шлюз ---------- */
export class AiGateway {
  private readonly providers: Provider[] = [];
  private readonly sem = new Semaphore(config.AFISHA_AI_MAX_PARALLEL);
  private spentDay = "";
  private spentTokens = 0;
  private failures = 0;
  private openUntil = 0;

  constructor() {
    if (config.AFISHA_AI_DISABLED) return;
    if (config.AFISHA_CLOUDRU_API_KEY) this.providers.push(new CloudRuProvider(config.AFISHA_CLOUDRU_API_KEY));
    if (config.AFISHA_GIGACHAT_CREDENTIALS) this.providers.push(new SberProvider(config.AFISHA_GIGACHAT_CREDENTIALS));
  }

  /** Есть ли живой провайдер, не исчерпан ли бюджет и не разомкнут ли предохранитель. */
  available(): boolean {
    this.rollDay();
    return (
      this.providers.length > 0 && this.spentTokens < config.AFISHA_AI_DAILY_TOKEN_BUDGET && Date.now() > this.openUntil
    );
  }

  status() {
    return { providers: this.providers.map((p) => p.name), available: this.available(), spentTokens: this.spentTokens };
  }

  private rollDay(): void {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== this.spentDay) {
      this.spentDay = day;
      this.spentTokens = 0;
    }
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!this.available())
      throw new AiUnavailableError("ИИ недоступен (нет ключей, бюджет исчерпан или предохранитель разомкнут)");
    const release = await this.sem.acquire();
    const t0 = Date.now();
    try {
      let lastErr: unknown = null;
      for (const p of this.providers) {
        try {
          const r = await p.chat(req);
          this.spentTokens += r.tokensIn + r.tokensOut;
          this.failures = 0;
          return { ...r, ms: Date.now() - t0 };
        } catch (err) {
          if (err instanceof AiBlacklistError) throw err;
          lastErr = err;
          log.warn({ provider: p.name, err: String(err) }, "ai.provider_failed");
        }
      }
      this.failures++;
      if (this.failures >= 3) this.openUntil = Date.now() + 60_000; // предохранитель на минуту
      throw lastErr instanceof Error ? lastErr : new AiUnavailableError(String(lastErr));
    } finally {
      release();
    }
  }

  async embed(texts: string[]): Promise<number[][] | null> {
    const p = this.providers.find((x) => x.embed);
    if (!p?.embed || !this.available()) return null;
    const release = await this.sem.acquire();
    try {
      return await p.embed(texts);
    } finally {
      release();
    }
  }
}

let gateway: AiGateway | null = null;
export const getGateway = (): AiGateway => {
  if (!gateway) gateway = new AiGateway();
  return gateway;
};
export const setGatewayForTests = (g: AiGateway | null) => {
  gateway = g;
};
