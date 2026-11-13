/**
 * Общий HTTP-слой к API для серверного кода админки: таймаут, разбор ошибок RFC 9457 (Problem),
 * проверка ответа zod-схемой. Кэш отключён: сотрудник всегда видит актуальные статусы.
 */
import "server-only";
import type { z } from "zod";
import { ADMIN_API_BASE } from "./config";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const TIMEOUT_MS = 20_000;

export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/json",
        "x-afisha-channel": "admin",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ApiError(0, `API недоступен: ${(err as Error).message}`);
  }
  if (!res.ok) {
    let title = `Ошибка API ${res.status}`;
    try {
      const problem = (await res.json()) as { title?: unknown; message?: unknown };
      if (typeof problem.title === "string") title = problem.title;
      else if (typeof problem.message === "string") title = problem.message;
    } catch {
      /* тело не JSON — оставляем общий текст */
    }
    throw new ApiError(res.status, title);
  }
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      502,
      `Ответ API ${path} не соответствует ожидаемой схеме: ${parsed.error.issues[0]?.message ?? ""}`,
    );
  }
  return parsed.data;
}
