"use server";
/**
 * Действия кабинета учреждения. Ввод проверяется повторно на сервере (те же функции, что в браузере),
 * запросы к Admin API идут с токеном из сессии. Ответ браузеру — только результат и понятное сообщение.
 */
import type { VenueListItem } from "@afisha/contract";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeOccurrenceStatus, createCabinetEvent, extractEventDraft } from "../admin-api";
import type { EventDraft } from "../admin-types";
import { REGION_TZ, siteEventUrl } from "../config";
import { coerceFormValues, type EventFormValues, type FieldErrors, validateEventForm } from "../event-form";
import { ApiError } from "../http";
import { listVenues } from "../public-api";
import { isUuid, requireSession, writeChosenOrg } from "../session";
import { type ActionInput, buildStatusBody, coerceActionInput, type SessionAction, successMessage } from "../status";

export type StatusResult =
  | { ok: true; message: string }
  | { ok: false; message?: string; errors?: Record<string, string> };

const ACTIONS: SessionAction[] = ["cancel", "reschedule", "sold_out", "restore"];

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError)
    return err.status === 0 ? "Сервер афиши не отвечает. Попробуйте через минуту." : err.message;
  return fallback;
}

export async function changeSessionStatus(
  occurrenceId: string,
  action: SessionAction,
  input: ActionInput,
): Promise<StatusResult> {
  await requireSession("/cabinet");
  if (!isUuid(occurrenceId) || !ACTIONS.includes(action)) return { ok: false, message: "Неверный запрос" };
  const built = buildStatusBody(action, coerceActionInput(input), REGION_TZ);
  if (!built.ok) return { ok: false, errors: built.errors };
  try {
    await changeOccurrenceStatus(occurrenceId, built.body);
  } catch (err) {
    return { ok: false, message: apiMessage(err, "Не удалось изменить статус") };
  }
  revalidatePath("/cabinet");
  return { ok: true, message: successMessage(built.body) };
}

export type ExtractResult = { ok: true; draft: EventDraft } | { ok: false; message: string };

export async function extractDraft(text: string): Promise<ExtractResult> {
  await requireSession("/cabinet/new");
  const clean = String(text ?? "").trim();
  if (clean.length < 10) return { ok: false, message: "Вставьте текст анонса — хотя бы одно предложение" };
  if (clean.length > 8000) return { ok: false, message: "Текст длиннее 8000 символов — сократите его" };
  try {
    return { ok: true, draft: await extractEventDraft(clean) };
  } catch (err) {
    return { ok: false, message: apiMessage(err, "Помощник не смог разобрать текст") };
  }
}

export async function searchVenues(q: string): Promise<VenueListItem[]> {
  await requireSession("/cabinet/new");
  const query = String(q ?? "")
    .trim()
    .slice(0, 100);
  if (query.length < 2) return [];
  try {
    return await listVenues({ q: query, limit: 15 });
  } catch {
    return [];
  }
}

export type PublishResult =
  | { ok: true; eventId: string; url: string }
  | { ok: false; message?: string; errors?: FieldErrors };

export async function publishEvent(values: EventFormValues): Promise<PublishResult> {
  await requireSession("/cabinet/new");
  const checked = validateEventForm(coerceFormValues(values), REGION_TZ);
  if (!checked.ok) return { ok: false, errors: checked.errors, message: "Проверьте выделенные поля" };
  try {
    const { event_id } = await createCabinetEvent(checked.data);
    revalidatePath("/cabinet");
    return { ok: true, eventId: event_id, url: siteEventUrl(event_id) };
  } catch (err) {
    return { ok: false, message: apiMessage(err, "Не удалось опубликовать событие") };
  }
}

/**
 * Выбор учреждения в кабинете — POST (Server Action), а не GET-ссылка: ссылки Next.js предзагружаются,
 * и GET с побочным эффектом сменил бы учреждение без клика. Запоминается только для удобства — это не право доступа.
 */
export async function chooseOrganization(formData: FormData): Promise<void> {
  await requireSession("/cabinet");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 300);
  if (!isUuid(id)) redirect("/cabinet?change=1");
  await writeChosenOrg({ id, name: name || "Учреждение" });
  redirect(`/cabinet?org=${id}`);
}
