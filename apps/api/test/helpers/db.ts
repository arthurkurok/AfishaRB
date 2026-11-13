/** Тестовая БД afisha_test: миграции + очистка + засев фикстурами (даты — относительно реального «сейчас»). */
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "../../src/db/client.js";
import { addDays, startOfLocalDay, todayLocal, weekdayOf } from "../../src/modules/geo/index.js";
import { CatalogWriter, ensureReference } from "../../src/modules/ingestion/pipeline.js";
import type { NormalizedEvent } from "../../src/modules/ingestion/types.js";
import { refreshDerived } from "../../src/modules/lifecycle/index.js";

let migrated = false;
export async function resetDb() {
  const db = getDb();
  if (!migrated) {
    await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    migrated = true;
  }
  await db.execute(sql`TRUNCATE event, occurrence, venue, organization, municipality, source_record, source_run, change_log,
    field_provenance, moderation_task, report, search_log, assistant_trace, profile, favorite, notification, saved_search CASCADE`);
  return db;
}

/** Ближайшая суббота (не сегодня) в TZ региона и момент «HH:MM» в этот день. */
export function nextSaturday(): string {
  const today = todayLocal();
  const diff = (6 - weekdayOf(today) + 7) % 7 || 7;
  return addDays(today, diff);
}
export const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(startOfLocalDay(date).getTime() + (h * 60 + m) * 60_000);
};

export function fixture(
  id: string,
  o: Partial<NormalizedEvent> & { start: Date; venue?: string; muni?: string },
): NormalizedEvent {
  const venue = o.venue ?? "v-puppet";
  const muni = o.muni ?? "ufa";
  return {
    sourceId: "culture_ru",
    externalId: id,
    title: o.title ?? `Событие ${id}`,
    summary: o.summary ?? "Описание",
    descriptionHtml: "<p>Описание</p>",
    categories: o.categories ?? ["theatre"],
    tags: o.tags ?? [],
    sourceGenres: [],
    ageRating: o.ageRating ?? 0,
    priceMin: o.priceMin ?? "400.00",
    priceMax: o.priceMax ?? "700.00",
    isFree: o.isFree ?? false,
    pushkinCard: o.pushkinCard ?? false,
    accessible: false,
    isPermanent: false,
    ticketUrl: "https://tickets.example/x",
    images: [],
    organization: {
      externalId: "org1",
      name: "Театр кукол",
      shortName: "Театр кукол",
      externalIds: { culture_org_id: "org1" },
    },
    venues: [
      {
        externalId: venue,
        name: venue === "v-puppet" ? "Башкирский театр кукол" : `Площадка ${venue}`,
        address: "Уфа",
        lat: muni === "ufa" ? 54.73 : 52.72,
        lon: muni === "ufa" ? 55.95 : 58.66,
        municipalityId: muni,
        municipalityTitle: muni === "ufa" ? "Уфа" : "Сибай",
        cultureLocaleId: 1,
        externalIds: { eipsk_place_id: venue },
      },
    ],
    sessions: [
      {
        externalId: `${id}-s1`,
        venueExternalId: venue,
        startsAt: o.start,
        endsAt: new Date(o.start.getTime() + 3600_000),
        isRange: false,
        ticketUrl: null,
      },
    ],
    sourceUrl: `https://www.culture.ru/events/${id}`,
    sourceUpdatedAt: null,
    languages: ["ru"],
  };
}

export async function seed(events: NormalizedEvent[]) {
  const db = getDb();
  await ensureReference(db);
  const w = new CatalogWriter(db, "culture_ru", null);
  await w.warm();
  for (const e of events) await w.upsert(e, { id: e.externalId, rnd: Math.random() });
  await w.flushLogs();
  await refreshDerived(db);
  return db;
}
