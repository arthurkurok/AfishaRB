/**
 * Клиент Admin API (`/admin/*`) — только для сервера. Bearer-токен берётся из сессии (httpOnly-cookie)
 * и никогда не уходит в браузер. Ответ 401 означает, что токен отозван или сменился: сессия сбрасывается,
 * сотрудник попадает на страницу входа.
 */
import "server-only";
import type { CabinetEventCreate } from "@afisha/contract";
import { redirect } from "next/navigation";
import type { z } from "zod";
import {
  CreatedEvent,
  Dashboard,
  EventDraft,
  ImportReport,
  type ModerationAction,
  type ModerationScope,
  ModerationTask,
  ReportRow,
  ResolveResponse,
  type StatusChangeBody,
  StatusChangeResult,
} from "./admin-types";
import { ApiError, apiFetch } from "./http";
import { requireSession } from "./session";

async function admin<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: "GET" | "POST"; body?: unknown; next?: string; token?: string } = {},
): Promise<z.infer<S>> {
  const token = init.token ?? (await requireSession(init.next)).token;
  try {
    return await apiFetch(path, schema, {
      method: init.method ?? "GET",
      body: init.body,
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !init.token) {
      const qs = init.next ? `?next=${encodeURIComponent(init.next)}` : "";
      redirect(`/session/expired${qs}`);
    }
    throw err;
  }
}

/** Проверка токена при входе: лёгкий запрос к очереди модерации с заведомо пустым фильтром. */
export async function verifyToken(token: string): Promise<"ok" | "invalid" | "unavailable"> {
  try {
    await apiFetch("/admin/moderation/tasks?kind=__login_probe", ModerationTask.array(), {
      headers: { authorization: `Bearer ${token}` },
    });
    return "ok";
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return "invalid";
    return "unavailable";
  }
}

export function getDashboard(days: number, next = "/") {
  return admin(`/admin/dashboard?days=${days}`, Dashboard, { next });
}

/** Сколько открытых задач запрашиваем (API: по умолчанию 500, максимум 1000). */
export const MODERATION_LIMIT = 500;

export function listModerationTasks(opts: { kind?: string; state?: string } = {}, next = "/moderation") {
  const params = new URLSearchParams({ state: opts.state ?? "open", limit: String(MODERATION_LIMIT) });
  if (opts.kind) params.set("kind", opts.kind);
  return admin(`/admin/moderation/tasks?${params}`, ModerationTask.array(), { next });
}

export function resolveModerationTask(id: string, action: ModerationAction, scope: ModerationScope = "task") {
  return admin(`/admin/moderation/tasks/${encodeURIComponent(id)}/resolve`, ResolveResponse, {
    method: "POST",
    // scope отправляем только при «ко всем сеансам события»: прежняя версия API его не знает
    body: scope === "event" ? { action, scope } : { action },
    next: "/moderation",
  });
}

export function listReports(next = "/moderation/reports") {
  return admin("/admin/reports", ReportRow.array(), { next });
}

export function extractEventDraft(text: string) {
  return admin("/admin/events/extract", EventDraft, { method: "POST", body: { text }, next: "/cabinet/new" });
}

export function createCabinetEvent(body: CabinetEventCreate) {
  return admin("/admin/events", CreatedEvent, { method: "POST", body, next: "/cabinet/new" });
}

export function changeOccurrenceStatus(occurrenceId: string, body: StatusChangeBody) {
  return admin(`/admin/occurrences/${encodeURIComponent(occurrenceId)}/status`, StatusChangeResult, {
    method: "POST",
    body,
    next: "/cabinet",
  });
}

/**
 * Импорт событий из CSV/JSON-файла (POST /admin/import). Текст файла уходит JSON-телом {content} —
 * multipart здесь не нужен, разбор и запись делает API. Только роль «Министерство».
 */
export function importFile(content: string, filename: string | null, dryRun: boolean, next = "/import") {
  return admin("/admin/import", ImportReport, {
    method: "POST",
    body: { content, filename, dry_run: dryRun },
    next,
  });
}
