/**
 * Запечатывание сессии: токен Admin API и роль хранятся в httpOnly-cookie в зашифрованном виде (AES-256-GCM).
 * Даже если значение cookie утечёт из журнала или профиля браузера, сам токен API из него не извлечь
 * без секрета сервера, а подделанная или просроченная cookie отбрасывается.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export type Role = "ministry" | "institution";

export interface SessionData {
  /** Bearer-токен Admin API */
  token: string;
  role: Role;
  /** Время выдачи и истечения, мс от эпохи */
  iat: number;
  exp: number;
}

/** Срок жизни сессии: рабочая смена. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const DEV_SECRET = "afisha-admin-dev-secret-not-for-production";

export class SessionConfigError extends Error {
  constructor() {
    super("Не задан ADMIN_SESSION_SECRET (не короче 32 символов) — вход в админку отключён");
    this.name = "SessionConfigError";
  }
}

/** Секрет из окружения. В production без секрета вход невозможен; в разработке — служебный секрет. */
export function resolveSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.ADMIN_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === "production") throw new SessionConfigError();
  return DEV_SECRET;
}

const keyOf = (secret: string) => createHash("sha256").update(secret).digest();

export function seal(data: SessionData, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

function isSession(v: unknown): v is SessionData {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.token === "string" &&
    s.token.length > 0 &&
    (s.role === "ministry" || s.role === "institution") &&
    typeof s.iat === "number" &&
    typeof s.exp === "number"
  );
}

/** Расшифровка и проверка срока. Любая ошибка (подделка, другой секрет, мусор) — `null`. */
export function unseal(value: string | undefined, secret: string, now: number = Date.now()): SessionData | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const data: unknown = JSON.parse(json);
    if (!isSession(data) || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

export function newSession(token: string, role: Role, now: number = Date.now()): SessionData {
  return { token, role, iat: now, exp: now + SESSION_TTL_MS };
}
