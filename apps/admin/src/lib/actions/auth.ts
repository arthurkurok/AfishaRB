"use server";
/**
 * Вход, выход и смена роли. Токен Admin API проверяется запросом к API и сохраняется только
 * в зашифрованной httpOnly-cookie; в ответ браузеру он не возвращается.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken } from "../admin-api";
import { AttemptLimiter } from "../rate-limit";
import { homeFor } from "../roles";
import { clearSession, isSafeNext, loginHref, readSession, updateRole, writeSession } from "../session";
import { type Role, resolveSecret, SessionConfigError } from "../session-crypto";

export interface LoginState {
  error?: string;
}

const limiter = new AttemptLimiter(5, 5 * 60_000);

async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const token = String(formData.get("token") ?? "").trim();
  const role: Role = formData.get("role") === "institution" ? "institution" : "ministry";
  const next = String(formData.get("next") ?? "");

  try {
    resolveSecret();
  } catch (err) {
    if (err instanceof SessionConfigError) return { error: err.message };
    throw err;
  }
  if (!token || token.length > 500) return { error: "Введите токен доступа" };

  const key = await clientKey();
  const wait = limiter.retryAfter(key);
  if (wait > 0) return { error: `Слишком много неудачных попыток. Повторите через ${Math.ceil(wait / 60)} мин.` };

  const result = await verifyToken(token);
  if (result === "unavailable") return { error: "Сервер афиши не отвечает. Попробуйте через минуту." };
  if (result === "invalid") {
    limiter.fail(key);
    return { error: "Токен не подошёл. Проверьте его и попробуйте ещё раз." };
  }
  limiter.reset(key);
  await writeSession(token, role);
  redirect(next && isSafeNext(next) ? next : homeFor(role));
}

export async function logout(): Promise<void> {
  await clearSession();
  redirect(loginHref(undefined, "logout"));
}

export async function switchRole(formData: FormData): Promise<void> {
  const session = await readSession();
  if (!session) redirect(loginHref());
  const role: Role = formData.get("role") === "institution" ? "institution" : "ministry";
  await updateRole(session, role);
  redirect(homeFor(role));
}
