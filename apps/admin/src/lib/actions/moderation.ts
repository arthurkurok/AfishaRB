"use server";
/** Решения модератора по задачам очереди (03-functional-spec §8). Доступно роли «Министерство». */
import { revalidatePath } from "next/cache";
import { resolveModerationTask } from "../admin-api";
import { ModerationAction, ModerationScope } from "../admin-types";
import { ApiError } from "../http";
import { isUuid, requireSession } from "../session";

/** stale — задача уже неактуальна (сеанс начался, статус изменили, задачу закрыл другой модератор): обновить очередь. */
export type ResolveResult = { ok: true; message: string } | { ok: false; message: string; stale?: boolean };

const DONE: Record<ModerationAction, string> = {
  merge: "Объединено: вторая карточка скрыта, её история сохранена в журнале.",
  distinct: "Отмечено: это разные события. Пара больше не попадёт в очередь.",
  dismiss: "Задача закрыта без решения.",
  confirm: "Подтверждено: сеанс идёт по плану и снова показывается как обычно.",
  cancel: "Сеанс отмечен как отменённый — так он показывается на сайте, в боте и в приложениях.",
};

/** Решение сразу по нескольким сеансам события (scope = event). */
const DONE_MANY: Partial<Record<ModerationAction, (n: number) => string>> = {
  confirm: (n) => `Подтверждено сеансов: ${n}. Они идут по плану и снова показываются как обычно.`,
  cancel: (n) => `Отменено сеансов: ${n}. Так они показываются на сайте, в боте и в приложениях.`,
};

export async function resolveTask(
  taskId: string,
  action: ModerationAction,
  scope: ModerationScope = "task",
): Promise<ResolveResult> {
  const session = await requireSession("/moderation");
  if (session.role !== "ministry") return { ok: false, message: "Решения по очереди принимает модератор министерства" };
  const parsed = ModerationAction.safeParse(action);
  const parsedScope = ModerationScope.safeParse(scope);
  if (!isUuid(taskId) || !parsed.success || !parsedScope.success) return { ok: false, message: "Неверный запрос" };
  let resolved = 1;
  try {
    const res = await resolveModerationTask(taskId, parsed.data, parsedScope.data);
    resolved = res.resolved ?? 1;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      revalidatePath("/moderation");
      return {
        ok: false,
        stale: true,
        message: `${err.message}. Очередь обновлена — переходим к следующей задаче.`,
      };
    }
    if (err instanceof ApiError && err.status === 400)
      return { ok: false, message: `Это решение не подходит к задаче: ${err.message}` };
    return { ok: false, message: err instanceof ApiError ? err.message : "Не удалось сохранить решение" };
  }
  revalidatePath("/moderation");
  const many = DONE_MANY[parsed.data];
  return { ok: true, message: resolved > 1 && many ? many(resolved) : DONE[parsed.data] };
}
