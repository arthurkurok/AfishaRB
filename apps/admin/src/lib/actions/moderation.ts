"use server";
/** Решения модератора по задачам очереди (03-functional-spec §8). Доступно роли «Министерство». */
import { revalidatePath } from "next/cache";
import { resolveModerationTask } from "../admin-api";
import { ModerationAction } from "../admin-types";
import { ApiError } from "../http";
import { isUuid, requireSession } from "../session";

export type ResolveResult = { ok: true; message: string } | { ok: false; message: string };

const DONE: Record<ModerationAction, string> = {
  merge: "Объединено: вторая карточка скрыта, её история сохранена в журнале.",
  distinct: "Отмечено: это разные события. Пара больше не попадёт в очередь.",
  dismiss: "Задача закрыта без решения.",
};

export async function resolveTask(taskId: string, action: ModerationAction): Promise<ResolveResult> {
  const session = await requireSession("/moderation");
  if (session.role !== "ministry") return { ok: false, message: "Решения по очереди принимает модератор министерства" };
  const parsed = ModerationAction.safeParse(action);
  if (!isUuid(taskId) || !parsed.success) return { ok: false, message: "Неверный запрос" };
  try {
    await resolveModerationTask(taskId, parsed.data);
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Не удалось сохранить решение" };
  }
  revalidatePath("/moderation");
  return { ok: true, message: DONE[parsed.data] };
}
