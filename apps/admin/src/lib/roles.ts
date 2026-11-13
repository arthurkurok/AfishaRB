/** Роли рабочего места. Пока Admin API выдаёт один токен, роль — выбор интерфейса (см. отчёт: RBAC на бэкенде). */
import type { Role } from "./session-crypto";

export const ROLE_LABEL: Record<Role, string> = {
  ministry: "Министерство",
  institution: "Учреждение",
};

export function homeFor(role: Role): string {
  return role === "institution" ? "/cabinet" : "/";
}
