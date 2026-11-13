/**
 * Статусы сеансов в кабинете: подписи (из общего словаря packages/i18n), доступные действия и тело запроса
 * POST /admin/occurrences/{id}/status. Чистые функции — покрыты тестами.
 */
import type { OccurrenceStatus } from "@afisha/contract";
import type { StatusChangeBody } from "./admin-types";
import { isValidDate, isValidTime, zonedToIso } from "./datetime";

export type SessionAction = "cancel" | "reschedule" | "sold_out" | "restore";

export const ACTION_LABEL: Record<SessionAction, string> = {
  cancel: "Отменить",
  reschedule: "Перенести",
  sold_out: "Распродано",
  restore: "Вернуть по плану",
};

/**
 * Что учреждение может сделать с сеансом в этом статусе.
 * Прошедший или завершённый сеанс не меняется; у перенесённого (старого) сеанса действий нет —
 * новый сеанс создан отдельной строкой, управлять нужно им.
 */
export function availableActions(
  o: { status: OccurrenceStatus; starts_at: string; ends_at?: string | null; is_range?: boolean },
  now: Date = new Date(),
): SessionAction[] {
  const end = new Date(o.is_range && o.ends_at ? o.ends_at : o.starts_at).getTime();
  if (end < now.getTime()) return [];
  switch (o.status) {
    case "scheduled":
      return ["cancel", "reschedule", "sold_out"];
    case "sold_out":
      return ["restore", "reschedule", "cancel"];
    case "postponed":
      return ["reschedule", "restore", "cancel"];
    case "unverified":
      return ["restore", "reschedule", "cancel"];
    case "cancelled":
      return ["restore"];
    default:
      return [];
  }
}

export interface ActionInput {
  reason?: string;
  date?: string;
  time?: string;
  /** «Новая дата пока неизвестна» при переносе → статус postponed */
  dateUnknown?: boolean;
}

export type BuildResult = { ok: true; body: StatusChangeBody } | { ok: false; errors: Record<string, string> };

const REASON_MAX = 300;

/** Проверка ввода из диалога и тело запроса к API. */
export function buildStatusBody(
  action: SessionAction,
  input: ActionInput,
  tz: string,
  now: Date = new Date(),
): BuildResult {
  const reason = (input.reason ?? "").trim();
  const errors: Record<string, string> = {};
  if (reason.length > REASON_MAX) errors.reason = `Не длиннее ${REASON_MAX} символов`;

  switch (action) {
    case "cancel": {
      if (reason.length < 3) errors.reason = "Укажите причину отмены — её увидят подписчики";
      if (Object.keys(errors).length) return { ok: false, errors };
      return { ok: true, body: { status: "cancelled", reason } };
    }
    case "reschedule": {
      if (input.dateUnknown) {
        if (Object.keys(errors).length) return { ok: false, errors };
        return { ok: true, body: { status: "postponed", ...(reason ? { reason } : {}) } };
      }
      const date = input.date ?? "";
      const time = input.time ?? "";
      if (!isValidDate(date)) errors.date = "Укажите новую дату";
      if (!isValidTime(time)) errors.time = "Укажите время в формате ЧЧ:ММ";
      if (Object.keys(errors).length) return { ok: false, errors };
      const iso = zonedToIso(date, time, tz);
      if (new Date(iso).getTime() <= now.getTime())
        return { ok: false, errors: { date: "Новая дата должна быть в будущем" } };
      return { ok: true, body: { status: "rescheduled", new_starts_at: iso, ...(reason ? { reason } : {}) } };
    }
    case "sold_out":
      if (Object.keys(errors).length) return { ok: false, errors };
      return { ok: true, body: { status: "sold_out", ...(reason ? { reason } : {}) } };
    case "restore":
      if (Object.keys(errors).length) return { ok: false, errors };
      return { ok: true, body: { status: "scheduled", ...(reason ? { reason } : {}) } };
  }
}

/** Сообщение после успешной смены статуса. */
export function successMessage(body: StatusChangeBody): string {
  const tail = "Подписчики получат уведомление.";
  switch (body.status) {
    case "cancelled":
      return `Сеанс отменён. ${tail}`;
    case "rescheduled":
      return `Сеанс перенесён, новый сеанс добавлен в афишу. ${tail}`;
    case "postponed":
      return `Сеанс отложен: новая дата уточняется. ${tail}`;
    case "sold_out":
      return `Отмечено: билетов нет. ${tail}`;
    case "scheduled":
      return `Сеанс снова идёт по плану. ${tail}`;
  }
}

/** Заголовок диалога подтверждения. */
export function dialogTitle(action: SessionAction): string {
  switch (action) {
    case "cancel":
      return "Отменить сеанс";
    case "reschedule":
      return "Перенести сеанс";
    case "sold_out":
      return "Отметить: билетов нет";
    case "restore":
      return "Вернуть сеанс по плану";
  }
}

/** Ввод диалога из недоверенного источника (Server Action) → ActionInput со строками ограниченной длины. */
export function coerceActionInput(raw: unknown): ActionInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof r[k] === "string" ? (r[k] as string).slice(0, max) : undefined);
  return { reason: s("reason", 1000), date: s("date", 10), time: s("time", 5), dateUnknown: r.dateUnknown === true };
}
