/**
 * sitemap.xml: статические страницы, все муниципалитеты и ближайшие события — в обеих языковых версиях
 * (03-functional-spec §2: «sitemap по муниципалитетам и событиям»).
 */
import type { SearchResult } from "@afisha/contract";
import type { MetadataRoute } from "next";
import { getMunicipalities, safe, searchOccurrences } from "@/lib/api";
import { SITE_URL } from "@/lib/config";

export const revalidate = 3600;

const MAX_EVENT_PAGES = 30;

function both(path: string, extra: Partial<MetadataRoute.Sitemap[number]> = {}): MetadataRoute.Sitemap[number] {
  return {
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    alternates: { languages: { ru: `${SITE_URL}${path}`, ba: `${SITE_URL}/ba${path === "/" ? "" : path}` } },
    ...extra,
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    both("/", { changeFrequency: "hourly", priority: 1, lastModified: now }),
    both("/search", { changeFrequency: "hourly", priority: 0.8 }),
    both("/guide", { priority: 0.6 }),
    both("/m", { changeFrequency: "daily", priority: 0.7 }),
    both("/developers", { priority: 0.4 }),
    both("/about", { priority: 0.3 }),
  ];
  const municipalities = await safe(getMunicipalities("ru"));
  for (const m of municipalities ?? []) {
    entries.push(both(`/m/${m.id}`, { changeFrequency: "daily", priority: m.kind === "city" ? 0.8 : 0.6 }));
  }
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const params = new URLSearchParams({ when: "month", sort: "date", limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const res: SearchResult | null = await safe(searchOccurrences(params, { revalidate: 3600 }));
    if (!res) break;
    for (const o of res.items) {
      if (seen.has(o.event.id)) continue;
      seen.add(o.event.id);
      entries.push(both(`/e/${o.event.id}`, { changeFrequency: "daily", priority: 0.5 }));
    }
    cursor = res.next_cursor;
    if (!cursor) break;
  }
  return entries;
}
