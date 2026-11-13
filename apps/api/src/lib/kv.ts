/**
 * Хранилище коротко живущего состояния (диалоги Гида, кнопки бота): Valkey, а при его недоступности — память процесса.
 * Valkey совместим с протоколом Redis, клиент — официальный `redis`.
 */
import { createClient } from "redis";
import { config } from "./config.js";
import { log } from "./log.js";

type Client = {
  isReady: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts: { EX: number }): Promise<unknown>;
  quit(): Promise<unknown>;
};
let client: Client | null = null;
let connecting: Promise<Client | null> | null = null;
const memory = new Map<string, { v: string; exp: number }>();

async function getClient(): Promise<Client | null> {
  if (config.AFISHA_ENV === "test") return null;
  if (client?.isReady) return client;
  if (!connecting) {
    connecting = (async () => {
      try {
        const c = createClient({
          url: config.AFISHA_VALKEY_URL,
          socket: { connectTimeout: 1500, reconnectStrategy: (n) => Math.min(n * 500, 5000) },
        });
        c.on("error", () => undefined);
        await c.connect();
        client = c as unknown as Client;
        return client;
      } catch (err) {
        log.warn({ err: String(err) }, "kv.valkey_unavailable_fallback_memory");
        return null;
      } finally {
        setTimeout(() => {
          connecting = null;
        }, 30_000);
      }
    })();
  }
  return connecting;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const c = await getClient();
  const raw = c
    ? await c.get(key).catch(() => null)
    : (() => {
        const e = memory.get(key);
        return e && e.exp > Date.now() ? e.v : null;
      })();
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function kvSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  const raw = JSON.stringify(value);
  const c = await getClient();
  if (c) {
    await c.set(key, raw, { EX: ttlSec }).catch(() => undefined);
    return;
  }
  memory.set(key, { v: raw, exp: Date.now() + ttlSec * 1000 });
  if (memory.size > 50_000) for (const [k, e] of memory) if (e.exp < Date.now()) memory.delete(k);
}

export async function kvClose(): Promise<void> {
  await client?.quit().catch(() => undefined);
  client = null;
}
