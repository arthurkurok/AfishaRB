/**
 * Сессия сотрудника на сервере. Токен Admin API живёт только в httpOnly-cookie (зашифрован) и читается
 * только серверным кодом: Server Components, Server Actions и Route Handlers. В клиентский JS он не попадает.
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { newSession, type Role, resolveSecret, SESSION_TTL_MS, type SessionData, seal, unseal } from "./session-crypto";

export const SESSION_COOKIE = "afisha_admin_session";
export const ORG_COOKIE = "afisha_admin_org";

const secure = () => process.env.ADMIN_COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production";

const baseCookie = () => ({
  httpOnly: true,
  secure: secure(),
  sameSite: "strict" as const,
  path: "/",
});

export async function readSession(): Promise<SessionData | null> {
  const store = await cookies();
  let secret: string;
  try {
    secret = resolveSecret();
  } catch {
    return null;
  }
  return unseal(store.get(SESSION_COOKIE)?.value, secret);
}

/** Сессия обязательна: без неё — на страницу входа (с возвратом обратно после входа). */
export async function requireSession(next?: string): Promise<SessionData> {
  const session = await readSession();
  if (!session) redirect(loginHref(next));
  return session;
}

export function loginHref(next?: string, reason?: "expired" | "logout"): string {
  const params = new URLSearchParams();
  if (next && isSafeNext(next)) params.set("next", next);
  if (reason) params.set("reason", reason);
  const qs = params.toString();
  return qs ? `/login?${qs}` : "/login";
}

/** Возврат после входа — только на внутренний путь админки (защита от открытого редиректа). */
export function isSafeNext(next: string): boolean {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login");
}

/** Только для Server Actions и Route Handlers: в Server Components cookie менять нельзя. */
export async function writeSession(token: string, role: Role): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, seal(newSession(token, role), resolveSecret()), {
    ...baseCookie(),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function updateRole(session: SessionData, role: Role): Promise<void> {
  const store = await cookies();
  const maxAge = Math.max(1, Math.floor((session.exp - Date.now()) / 1000));
  store.set(SESSION_COOKIE, seal({ ...session, role }, resolveSecret()), { ...baseCookie(), maxAge });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ORG_COOKIE);
}

/* ---------- Выбранное учреждение (не секрет, но тоже только на сервере) ---------- */

export interface ChosenOrg {
  id: string;
  name: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export async function readChosenOrg(): Promise<ChosenOrg | null> {
  const store = await cookies();
  const raw = store.get(ORG_COOKIE)?.value;
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<ChosenOrg>;
    return isUuid(v.id) && typeof v.name === "string" ? { id: v.id, name: v.name.slice(0, 300) } : null;
  } catch {
    return null;
  }
}

export async function writeChosenOrg(org: ChosenOrg): Promise<void> {
  const store = await cookies();
  store.set(ORG_COOKIE, Buffer.from(JSON.stringify(org), "utf8").toString("base64url"), {
    ...baseCookie(),
    maxAge: 60 * 60 * 24 * 30,
  });
}
