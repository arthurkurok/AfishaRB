/**
 * GET /v1/organizations группирует по учреждению и муниципалитету сеанса, поэтому учреждение с сеансами
 * в нескольких муниципалитетах приходит несколькими строками с одним id (см. отчёт: дефект API).
 * Склеиваем: одна строка на учреждение, муниципалитеты через запятую, сеансы суммируются.
 */
import type { OrganizationRef } from "@afisha/contract";

export function mergeOrganizations(rows: OrganizationRef[]): OrganizationRef[] {
  const byId = new Map<string, { org: OrganizationRef; places: string[] }>();
  for (const r of rows) {
    const cur = byId.get(r.id);
    if (!cur) {
      byId.set(r.id, { org: { ...r }, places: r.municipality ? [r.municipality] : [] });
      continue;
    }
    cur.org.upcoming += r.upcoming;
    if (r.municipality && !cur.places.includes(r.municipality)) cur.places.push(r.municipality);
  }
  return [...byId.values()]
    .map(({ org, places }) => ({ ...org, municipality: places.length ? places.join(", ") : null }))
    .sort((a, b) => b.upcoming - a.upcoming);
}
