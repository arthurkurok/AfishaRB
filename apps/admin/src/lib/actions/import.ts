"use server";
/**
 * Импорт файла со списком событий (ТЗ 6.1, роль «Министерство»). Файл читается на сервере,
 * текст уходит в Admin API JSON-телом; браузер получает только отчёт и понятные сообщения об ошибках.
 * Проверки повторяются на сервере: роль, размер, расширение — доверять браузеру нельзя.
 */
import { revalidatePath } from "next/cache";
import { importFile } from "../admin-api";
import type { ImportReport } from "../admin-types";
import { ApiError } from "../http";
import { requireSession } from "../session";

export type ImportResult = { ok: true; report: ImportReport } | { ok: false; message: string };

/** В форму не грузим больше 5 МБ — на маршруте лимит 10 МБ, запас на кодирование. */
const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_NAME = /\.(csv|json)$/i;

function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError)
    return err.status === 0 ? "Сервер афиши не отвечает. Попробуйте через минуту." : err.message;
  return fallback;
}

export async function importEvents(file: File, dryRun: boolean): Promise<ImportResult> {
  const session = await requireSession("/import");
  if (session.role !== "ministry") return { ok: false, message: "Импорт доступен только роли «Министерство»" };
  if (file.size === 0) return { ok: false, message: "Файл пустой" };
  if (file.size > MAX_SIZE)
    return {
      ok: false,
      message: `Файл ${Math.round(file.size / 1024 / 1024)} МБ — больше 5 МБ. Разбейте его на части.`,
    };
  const filename = file.name || "events.csv";
  if (!ALLOWED_NAME.test(filename)) return { ok: false, message: "Поддерживаются файлы .csv и .json" };

  let content: string;
  try {
    content = await file.text();
  } catch {
    return { ok: false, message: "Не удалось прочитать файл" };
  }

  try {
    const report = await importFile(content, filename, dryRun);
    // афиша и дашборд могли пополниться; сухой прогон ничего не меняет
    if (!dryRun) revalidatePath("/");
    return { ok: true, report };
  } catch (err) {
    return { ok: false, message: apiMessage(err, "Импорт не удался") };
  }
}
