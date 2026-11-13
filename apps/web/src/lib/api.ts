/**
 * Типизированный клиент публичного API. Типы — из `@afisha/contract` (contract-first, CLAUDE.md инвариант 3).
 * Работает и на сервере (RSC, ISR через `next.revalidate`), и в браузере.
 */
import type {
  AssistantRequest,
  AssistantResponse,
  Category,
  EventDetail,
  Municipality,
  ReportRequest,
  SearchResult,
  Stats,
  VenueDetail,
} from "@afisha/contract";
import type { Lang } from "@afisha/i18n";
import type { z } from "zod";
import { API_BASE, API_BASE_SERVER, REVALIDATE_SECONDS } from "./config";

export type CatalogStats = z.infer<typeof Stats>;
export type ReportBody = z.infer<typeof ReportRequest>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const isServer = typeof window === "undefined";

interface GetOptions {
  /** Секунды ISR-кэша на сервере; 0 — без кэша. */
  revalidate?: number;
  signal?: AbortSignal;
}

function base(): string {
  return isServer ? API_BASE_SERVER : API_BASE;
}

export function apiUrl(path: string, params?: URLSearchParams | Record<string, string | undefined>): string {
  const url = new URL(path, `${base()}/`);
  const entries = params instanceof URLSearchParams ? [...params] : Object.entries(params ?? {});
  for (const [k, v] of entries) if (v !== undefined && v !== "") url.searchParams.set(k, v);
  return url.toString();
}

async function request<T>(url: string, init: RequestInit & { next?: { revalidate?: number | false } }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ApiError(0, `Сеть недоступна: ${(err as Error).message}`);
  }
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} ${url}`);
  return (await res.json()) as T;
}

async function get<T>(
  path: string,
  params?: URLSearchParams | Record<string, string | undefined>,
  opts: GetOptions = {},
) {
  const revalidate = opts.revalidate ?? REVALIDATE_SECONDS;
  const signal = opts.signal ?? (isServer ? AbortSignal.timeout(10_000) : undefined);
  return request<T>(apiUrl(path, params), {
    headers: { accept: "application/json", "x-afisha-channel": "web" },
    signal,
    ...(isServer ? { next: { revalidate: revalidate === 0 ? 0 : revalidate } } : {}),
    ...(isServer && revalidate === 0 ? { cache: "no-store" as const } : {}),
  });
}

export function searchOccurrences(params: URLSearchParams, opts?: GetOptions): Promise<SearchResult> {
  return get<SearchResult>("/v1/occurrences", params, opts);
}

export function getEvent(id: string, lang: Lang, opts?: GetOptions): Promise<EventDetail> {
  return get<EventDetail>(`/v1/events/${encodeURIComponent(id)}`, { lang }, opts);
}

export function getVenue(id: string, lang: Lang, opts?: GetOptions): Promise<VenueDetail> {
  return get<VenueDetail>(`/v1/venues/${encodeURIComponent(id)}`, { lang }, opts);
}

export function getCategories(lang: Lang, opts?: GetOptions): Promise<Category[]> {
  return get<Category[]>("/v1/categories", { lang }, opts);
}

export function getMunicipalities(lang: Lang, opts?: GetOptions): Promise<Municipality[]> {
  return get<Municipality[]>("/v1/municipalities", { lang }, { revalidate: 3600, ...opts });
}

export function getStats(opts?: GetOptions): Promise<CatalogStats> {
  return get<CatalogStats>("/v1/stats", undefined, opts);
}

export function postReport(body: ReportBody): Promise<{ ok: true }> {
  return request(apiUrl("/v1/reports"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-afisha-channel": "web" },
    body: JSON.stringify(body),
  });
}

export function askAssistant(body: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse> {
  return request(apiUrl("/v1/assistant"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-afisha-channel": "web" },
    body: JSON.stringify(body),
    signal,
  });
}

/** Безопасная загрузка для страниц: ошибка API превращается в `null`, страница показывает состояние ошибки. */
export async function safe<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if (process.env.NODE_ENV !== "test") console.error("[api]", (err as Error).message);
    return null;
  }
}
