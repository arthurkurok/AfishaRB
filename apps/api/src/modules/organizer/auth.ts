/**
 * Аутентификация и роли Admin API (docs/09-compliance-security.md §3).
 * Токены → субъекты: «министерство» (всё) или «учреждение» (только свои события и площадки).
 * Сравнение — в постоянном времени по SHA-256. Сессии с паролем и TOTP — этап M5 (ADR-017).
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "../../lib/config.js";

export type Principal = {
  name: string;
  role: "ministry" | "organization";
  organizationId: string | null;
};

const TokenEntry = z.object({
  token: z.string().min(16),
  name: z.string().min(2),
  role: z.enum(["ministry", "organization"]),
  organization_id: z.uuid().optional(),
});

const digest = (s: string) => createHash("sha256").update(s).digest();

let table: { hash: Buffer; principal: Principal }[] | null = null;

function principals() {
  if (table) return table;
  const entries: z.infer<typeof TokenEntry>[] = [];
  if (config.AFISHA_ADMIN_TOKENS) {
    const parsed = z.array(TokenEntry).safeParse(JSON.parse(config.AFISHA_ADMIN_TOKENS));
    if (!parsed.success)
      throw new Error(
        "AFISHA_ADMIN_TOKENS: неверный формат (ожидается JSON-массив {token,name,role,organization_id?})",
      );
    entries.push(...parsed.data);
  }
  if (config.AFISHA_ADMIN_TOKEN)
    entries.push({ token: config.AFISHA_ADMIN_TOKEN, name: "Министерство (общий токен)", role: "ministry" });
  table = entries
    .filter((e) => e.role === "ministry" || e.organization_id)
    .map((e) => ({
      hash: digest(e.token),
      principal: { name: e.name, role: e.role, organizationId: e.organization_id ?? null },
    }));
  return table;
}

/** Субъект по заголовку Authorization: Bearer <токен>; null — неизвестный токен. */
export function authenticate(header: string | undefined): Principal | null {
  if (!header?.startsWith("Bearer ")) return null;
  const given = digest(header.slice(7).trim());
  let found: Principal | null = null;
  for (const e of principals()) {
    // проверяем все записи, чтобы время ответа не зависело от позиции токена
    if (timingSafeEqual(e.hash, given)) found = e.principal;
  }
  return found;
}

export const isMinistry = (p: Principal) => p.role === "ministry";
export const actorOf = (p: Principal) => `${p.role === "ministry" ? "ministry" : "org"}:${p.name}`;

/** Для тестов: сбросить кэш таблицы токенов после смены окружения. */
export const resetAuthCache = () => {
  table = null;
};
