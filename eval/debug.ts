/**
 * Отладка отдельных контрольных кейсов: полный ответ гида (kind, текст, слоты, relaxed).
 * Запуск: npx tsx debug.ts s05,m04,i01
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import pg from "pg";

/** Контрольное событие из датасета (как в control.ts). */
type SeedEvent = {
  external_id: string;
  title: string;
  categories: string[];
  description?: string;
  municipality: string;
  age_rating: number;
  start_day: string;
  start_time: string;
  end_time?: string;
  price_min?: number;
  price_max?: number;
  is_free?: boolean;
  occurrence_status?: string;
};

const dataset = JSON.parse(readFileSync(new URL("./datasets/control.json", import.meta.url), "utf8")) as {
  fixed_now: string;
  cases: Array<{
    id: string;
    group: string;
    text?: string;
    turns?: Array<{ text: string }>;
    seed?: { events: SeedEvent[] };
  }>;
};
const NOW = new Date(dataset.fixed_now);
const REPO = resolve(import.meta.dirname, "../..");
const SRC_URL = process.env.AFISHA_DATABASE_URL ?? "postgres://afisha:afisha@localhost:55432/afisha";
const TMP_DB = `afisha_dbg_${process.pid}`;

const srcUrl = new URL(SRC_URL);
const srcName = srcUrl.pathname.slice(1);
const admin = new pg.Client({ connectionString: new URL("/postgres", srcUrl).toString() });
await admin.connect();
await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
  [srcName],
);
await admin.query(`CREATE DATABASE "${TMP_DB}" TEMPLATE "${srcName}"`);
const tmpUrl = new URL(`/${TMP_DB}`, srcUrl).toString();
await admin.end();
process.env.AFISHA_DATABASE_URL = tmpUrl;

const { getDb, closeDb } = await import("../apps/api/src/db/client.js");
const db = getDb();
const { handleAssistant } = await import("../apps/api/src/modules/assistant/index.js");

/* --- сид контрольных событий (как в control.ts) + DI подписки/заявки --- */
const { CatalogWriter } = await import("../apps/api/src/modules/ingestion/pipeline.js");
const { refreshDerived } = await import("../apps/api/src/modules/lifecycle/index.js");
const { startOfLocalDay } = await import("../apps/api/src/modules/geo/index.js");

const muniNames = new Map(
  (
    await db.execute<{ id: string; name: string }>(sql`SELECT id, name->>'ru' AS name FROM municipality`)
  ).rows.map((r) => [r.id, r.name]),
);
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(startOfLocalDay(day).getTime() + (h * 60 + m) * 60_000);
};
const seededEvents = dataset.cases.flatMap((c) => (c.seed?.events ?? []).map((ev) => ({ ev })));
if (seededEvents.length) {
  const writer = new CatalogWriter(db, "culture_ru", null);
  await writer.warm();
  for (const { ev } of seededEvents) {
    const tags: string[] = [];
    if (/^экскурси/iu.test(ev.title)) tags.push("excursion");
    if (/мастер-?класс/iu.test(ev.title)) tags.push("master_class");
    if (/фестивал/iu.test(ev.title)) tags.push("festival");
    const start = at(ev.start_day, ev.start_time);
    const end = ev.end_time ? at(ev.start_day, ev.end_time) : new Date(start.getTime() + 2 * 3600_000);
    await writer.upsert(
      {
        sourceId: "culture_ru",
        externalId: `ctrl-${ev.external_id}`,
        title: ev.title,
        summary: (ev.description ?? "Контрольное событие прогонки").slice(0, 300),
        descriptionHtml: `<p>${ev.description ?? "Контрольное событие прогонки"}</p>`,
        categories: ev.categories as never,
        tags: tags as never,
        sourceGenres: [],
        ageRating: ev.age_rating,
        priceMin: ev.is_free ? null : String(ev.price_min ?? 0),
        priceMax: ev.is_free ? null : String(ev.price_max ?? ev.price_min ?? 0),
        isFree: Boolean(ev.is_free) || ((ev.price_min ?? 0) === 0 && (ev.price_max ?? 0) === 0),
        pushkinCard: false,
        accessible: false,
        isPermanent: false,
        ticketUrl: null,
        images: [],
        organization: { externalId: "ctrl-org", name: "Учреждение контроля", shortName: null, externalIds: {} },
        venues: [
          {
            externalId: `ctrl-v-${ev.external_id}`,
            name: `Площадка «${ev.municipality}» (контроль)`,
            address: muniNames.get(ev.municipality) ?? ev.municipality,
            lat: null,
            lon: null,
            municipalityId: ev.municipality,
            municipalityTitle: muniNames.get(ev.municipality) ?? null,
            cultureLocaleId: null,
            externalIds: {},
          },
        ],
        sessions: [
          {
            externalId: `${ev.external_id}-s1`,
            venueExternalId: `ctrl-v-${ev.external_id}`,
            startsAt: start,
            endsAt: end,
            isRange: false,
            ticketUrl: null,
          },
        ],
        sourceUrl: null,
        sourceUpdatedAt: null,
        languages: ["ru"],
      },
      { id: `ctrl-${ev.external_id}`, rnd: 0.5 },
    );
  }
  await writer.flushLogs();
  await refreshDerived(db);
  // Машина времени: refreshDerived помечает прошедшие сеансы «ended» по реальному времени,
  // а отладка живёт с фиксированным «сейчас» из датасета — отматываем не начавшиеся по часам прогона
  await db.execute(sql`
    UPDATE occurrence SET status = 'scheduled', status_reason = NULL
    WHERE status = 'ended' AND starts_at > ${NOW}`);
}

const controlProfileId = (
  await db.execute<{ id: string }>(
    sql`INSERT INTO profile (channel, external_id, last_seen_at) VALUES ('device', 'debug-run', now())
        ON CONFLICT (channel, external_id) DO UPDATE SET last_seen_at = now() RETURNING id`,
  )
).rows[0]!.id;
const debugSubscribe = async (args: {
  city_id: string | null;
  category: "theatre" | "music" | "museum" | "kids" | "folk" | "cinema" | "education" | null;
  period: string | null;
  replace: boolean;
}) => {
  await db.execute(
    sql`INSERT INTO saved_search (profile_id, title, query) VALUES (${controlProfileId}, ${`${args.city_id ?? "все"} ${args.category ?? ""}`}, ${JSON.stringify({ municipality: args.city_id, categories: args.category ? [args.category] : [] })}::jsonb)`,
  );
  return { ok: true };
};
const debugFeedback = async () => ({ ok: true });

const only = process.argv[2]?.split(",") ?? ["s05"];
for (const id of only) {
  const c = dataset.cases.find((x) => x.id === id);
  if (!c) {
    console.log(`?? ${id}: нет такого кейса`);
    continue;
  }
  const turns = c.turns ?? (c.text ? [{ text: c.text }] : []);
  let convId: string | undefined;
  console.log(`\n===== ${id} (${c.group}) =====`);
  for (const t of turns) {
    const resp = await handleAssistant(db, { text: t.text, conversation_id: convId }, { channel: "control", now: NOW, subscribeFn: debugSubscribe, saveFeedbackFn: debugFeedback });
    convId = resp.conversation_id;
    console.log(`--- user: ${t.text}`);
    console.log(
      JSON.stringify(
        {
          kind: resp.kind,
          mode: resp.mode,
          clarify: resp.clarify,
          relaxed: resp.relaxed,
          slots: resp.slots,
          confirm: resp.confirm,
        },
        null,
        1,
      ),
    );
    console.log(`text: ${resp.text}`);
    console.log(
      `picks: ${resp.picks.map((p) => `${p.occurrence.event.title} · ${p.occurrence.starts_at.slice(0, 16)} · ${p.occurrence.event.price.is_free ? "бесплатно" : p.occurrence.event.price.min + "₽"} · ${p.occurrence.event.age_rating}+`).join(" | ")}`,
    );
    if (resp.trace) console.log(`trace: ${resp.trace.steps?.map((s: { tool: string }) => s.tool).join(" → ")}`);
  }
}

await closeDb();
const admin2 = new pg.Client({ connectionString: new URL("/postgres", srcUrl).toString() });
await admin2.connect();
await admin2.query(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`);
await admin2.end();
void sql;
process.exit(0);
