/**
 * Публичные эндпоинты v1, которые нужны кабинету: учреждения, площадки, сеансы учреждения, паспорт события.
 * Схемы и типы — из `@afisha/contract` (contract-first): ответ проверяется той же схемой, что и на сервере API.
 */
import "server-only";
import { EventDetail, OrganizationRef, SearchResult, VenueListItem } from "@afisha/contract";
import { apiFetch } from "./http";
import { mergeOrganizations } from "./orgs";

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};

export async function listOrganizations(opts: { q?: string; municipality?: string; limit?: number } = {}) {
  const rows = await apiFetch(`/v1/organizations?${qs({ ...opts, limit: opts.limit ?? 30 })}`, OrganizationRef.array());
  return mergeOrganizations(rows);
}

export function listVenues(opts: { q?: string; municipality?: string; limit?: number } = {}) {
  return apiFetch(`/v1/venues?${qs({ ...opts, limit: opts.limit ?? 30 })}`, VenueListItem.array());
}

/** Сеансы учреждения по дате, без группировки, включая отменённые и перенесённые — кабинету нужны все статусы. */
export function organizationOccurrences(opts: {
  organization: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}) {
  return apiFetch(
    `/v1/occurrences?${qs({
      organization: opts.organization,
      group: false,
      sort: "date",
      include_ended: true,
      limit: opts.limit ?? 100,
      date_from: opts.dateFrom,
      date_to: opts.dateTo,
      q: opts.q,
      cursor: opts.cursor,
    })}`,
    SearchResult,
  );
}

export function getEvent(id: string) {
  return apiFetch(`/v1/events/${encodeURIComponent(id)}?lang=ru`, EventDetail);
}
