/**
 * Исчезнувшие из источника сеансы (docs/06-data.md §7): задачи модератору, их решение и автозакрытие,
 * сгруппированная история в паспорте события и сеансы, у которых источник сменил внешний id.
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, type Db } from "../src/db/client.js";
import { buildApp } from "../src/main/app.js";
import { CatalogWriter, cleanupReplacedSessions, finishRun, startRun } from "../src/modules/ingestion/pipeline.js";
import type { NormalizedEvent } from "../src/modules/ingestion/types.js";
import { markEnded } from "../src/modules/lifecycle/index.js";
import { at, fixture, nextSaturday, resetDb, seed } from "./helpers/db.js";

let db: Db;
let app: FastifyInstance;
const sat = nextSaturday();
const auth = { authorization: "Bearer dev-admin-token" };

/** Событие с несколькими сеансами в одном зале (время — «HH:MM» в субботу). */
function multi(id: string, title: string, times: string[], sessionIds?: string[]): NormalizedEvent {
  const base = fixture(id, { title, start: at(sat, times[0]!) });
  return {
    ...base,
    sessions: times.map((t, i) => ({
      externalId: sessionIds?.[i] ?? `${id}-s${i + 1}`,
      venueExternalId: "v-puppet",
      startsAt: at(sat, t),
      endsAt: new Date(at(sat, t).getTime() + 3600_000),
      isRange: false,
      ticketUrl: null,
    })),
  };
}

const raw = (e: NormalizedEvent) => ({
  id: e.externalId,
  title: e.title,
  sessions: e.sessions.map((s) => `${s.externalId}@${s.startsAt.toISOString()}`),
});

/** Полный прогон источника: что не пришло — «исчезло». */
async function run(events: NormalizedEvent[]) {
  const runId = await startRun(db, "culture_ru");
  const w = new CatalogWriter(db, "culture_ru", runId);
  await w.warm();
  for (const e of events) await w.upsert(e, raw(e));
  await w.flushLogs();
  await finishRun(db, "culture_ru", runId, w.stats, true);
  return w.stats;
}

const excursion = multi("geo", "Экскурсия «Геологические поиски»", ["10:00", "12:00", "14:00", "16:00"]);
const lecture = multi("lec", "Лекция «Курай»", ["11:00", "13:00"]);
const concert = fixture("con", { title: "Концерт «Йыр»", start: at(sat, "18:00") });
const play = fixture("play", { title: "Спектакль «Прошедший»", start: at(sat, "19:00") });

type Task = {
  id: string;
  kind: string;
  state: string;
  entity_id: string;
  title_a: string | null;
  event_id: string | null;
  group_size: number;
  occurrence: {
    id: string;
    event_id: string;
    starts_at: string;
    status: string;
    venue: { id: string; name: string; address: string | null } | null;
    municipality: string | null;
  } | null;
};
const tasks = async (q = "kind=vanished") =>
  (await app.inject({ url: `/admin/moderation/tasks?${q}`, headers: auth })).json() as Task[];
const resolve = (id: string, action: string, extra: Record<string, unknown> = {}) =>
  app.inject({
    method: "POST",
    url: `/admin/moderation/tasks/${id}/resolve`,
    headers: auth,
    payload: { action, ...extra },
  });
const occ = async (id: string) =>
  (
    await db.execute<{ status: string; status_reason: string | null; freshness: string }>(
      sql`SELECT status, status_reason, freshness FROM occurrence WHERE id = ${id}`,
    )
  ).rows[0]!;
const eventId = async (ext: string) =>
  (
    await db.execute<{ id: string }>(
      sql`SELECT mapped_event_id AS id FROM source_record WHERE source_id = 'culture_ru' AND external_id = ${ext}`,
    )
  ).rows[0]!.id;

beforeAll(async () => {
  await resetDb();
  db = await seed([]);
  app = await buildApp();
  await app.ready();
  await run([excursion, lecture, concert, play]);
  await run([concert]); // экскурсия, лекция и спектакль исчезли из источника целиком
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("очередь модерации: исчезнувшие сеансы", () => {
  it("задача на сеанс показывает название события и данные сеанса", async () => {
    const list = await tasks();
    const geo = list.filter((t) => t.title_a === "Экскурсия «Геологические поиски»");
    expect(geo).toHaveLength(4);
    const t = geo[0]!;
    expect(t.event_id).toBe(await eventId("geo"));
    expect(t.occurrence).toMatchObject({ id: t.entity_id, event_id: t.event_id, status: "unverified" });
    expect(t.occurrence!.starts_at).toBe(`${sat}T10:00:00+05:00`);
    expect(t.occurrence!.venue?.name).toBe("Башкирский театр кукол");
    expect(t.group_size).toBe(4);
    // ближайший сеанс — первым в очереди своего события
    expect(geo.map((x) => x.occurrence!.starts_at.slice(11, 16))).toEqual(["10:00", "12:00", "14:00", "16:00"]);
  });

  it("форма ответа для задач на событие не меняется: occurrence = null", async () => {
    await db.execute(sql`
      INSERT INTO moderation_task (region_id, kind, entity_type, entity_id, priority, payload)
      VALUES ('ba', 'validation', 'event', ${await eventId("con")}, 30, '{"problems":["date: тест"]}'::jsonb)`);
    const v = (await tasks("kind=validation"))[0]!;
    expect(v.title_a).toBe("Концерт «Йыр»");
    expect(v.occurrence).toBeNull();
    expect(v.event_id).toBe(await eventId("con"));
  });

  it("confirm: сеанс снова по плану, причина снята, журнал записан, задача закрыта", async () => {
    const t = (await tasks()).find((x) => x.title_a?.startsWith("Экскурсия"))!;
    const r = await resolve(t.id, "confirm");
    expect(r.statusCode).toBe(200);
    expect(await occ(t.entity_id)).toMatchObject({ status: "scheduled", status_reason: null, freshness: "fresh" });
    const log = (
      await db.execute(
        sql`SELECT old_value, new_value, source_id FROM change_log WHERE entity_id = ${t.entity_id} AND source_id = 'moderator'`,
      )
    ).rows;
    expect(log).toEqual([{ old_value: "unverified", new_value: "scheduled", source_id: "moderator" }]);
    const row = (await db.execute(sql`SELECT state, resolution FROM moderation_task WHERE id = ${t.id}`)).rows[0];
    expect(row).toEqual({ state: "done", resolution: "confirm" });
    expect((await resolve(t.id, "confirm")).statusCode).toBe(409);
  });

  it("cancel: сеанс отменён, журнал записан; merge к задаче на сеанс неприменим", async () => {
    const t = (await tasks()).find((x) => x.title_a?.startsWith("Экскурсия"))!;
    expect((await resolve(t.id, "merge")).statusCode).toBe(400);
    expect((await resolve(t.id, "cancel")).statusCode).toBe(200);
    expect((await occ(t.entity_id)).status).toBe("cancelled");
    const log = (
      await db.execute(
        sql`SELECT new_value FROM change_log WHERE entity_id = ${t.entity_id} AND source_id = 'moderator'`,
      )
    ).rows;
    expect(log).toEqual([{ new_value: "cancelled" }]);
  });

  it("scope=event: одно решение закрывает все открытые задачи этого события", async () => {
    const geo = (await tasks()).filter((x) => x.title_a?.startsWith("Экскурсия"));
    expect(geo).toHaveLength(2);
    const r = await resolve(geo[0]!.id, "confirm", { scope: "event" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, resolved: 2 });
    for (const t of geo) expect((await occ(t.entity_id)).status).toBe("scheduled");
    expect((await tasks()).filter((x) => x.title_a?.startsWith("Экскурсия"))).toHaveLength(0);
  });

  it("сеанс уже начался — задача не висит в очереди и закрывается автоматически", async () => {
    const t = (await tasks()).find((x) => x.title_a === "Спектакль «Прошедший»")!;
    await db.execute(sql`UPDATE occurrence SET starts_at = now() - interval '4 hours', ends_at = now() - interval '3 hours'
                         WHERE id = ${t.entity_id}`);
    expect((await tasks()).some((x) => x.id === t.id)).toBe(false);
    await markEnded(db);
    const row = (
      await db.execute<{ state: string; resolution: string; payload: Record<string, unknown> }>(
        sql`SELECT state, resolution, payload FROM moderation_task WHERE id = ${t.id}`,
      )
    ).rows[0]!;
    expect(row.state).toBe("done");
    expect(row.resolution).toBe("expired");
    expect(String(row.payload.resolution_text)).toMatch(/прош/);
  });

  it("источник снова показал событие — задачи закрыты, паспорт без 2×N одинаковых записей", async () => {
    await run([concert, lecture]);
    expect((await tasks()).filter((x) => x.title_a === "Лекция «Курай»")).toHaveLength(0);
    const detail = (await app.inject({ url: `/v1/events/${await eventId("lec")}` })).json() as {
      history: { text: string; occurrences_count?: number }[];
    };
    const status = detail.history.filter((h) => h.text.startsWith("Статус"));
    expect(status).toHaveLength(2);
    expect(status[0]).toMatchObject({
      text: "Статус: по плану — событие снова подтверждено источником (2 сеанса)",
      occurrences_count: 2,
    });
    expect(status[1]).toMatchObject({
      text: "Статус: информация уточняется — событие исчезло из источника (2 сеанса)",
      occurrences_count: 2,
    });
  });
});

describe("сеанс, у которого источник сменил внешний id", () => {
  const cat = (ids: string[], times = ["12:00"]) => multi("leo", "День рождения кота Леопольда", times, ids);

  it("тот же зал и время (±15 мин) — это замена: без «уточняется», без дубля, без журнала статусов", async () => {
    await run([concert, cat(["leo-a"])]);
    await run([concert, cat(["leo-b"])]);
    const rows = (
      await db.execute<{ status: string; source_key: string }>(
        sql`SELECT status, source_key FROM occurrence WHERE event_id = ${await eventId("leo")}`,
      )
    ).rows;
    expect(rows).toEqual([{ status: "scheduled", source_key: "culture_ru:leo:leo-b" }]);
    const statusLogs = (
      await db.execute(sql`SELECT 1 FROM change_log WHERE event_id = ${await eventId("leo")} AND kind = 'status'`)
    ).rows;
    expect(statusLogs).toHaveLength(0);
  });

  it("разовая чистка: уже возникшие пары «уточняется + по плану» на то же время схлопываются", async () => {
    const ev = await eventId("leo");
    const live = (
      await db.execute<{ id: string; venue_id: string; starts_at: Date }>(
        sql`SELECT id, venue_id, starts_at FROM occurrence WHERE event_id = ${ev}`,
      )
    ).rows[0]!;
    await db.execute(sql`
      INSERT INTO occurrence (region_id, event_id, venue_id, starts_at, ends_at, status, status_reason, freshness, source_key)
      VALUES ('ba', ${ev}, ${live.venue_id}, ${live.starts_at}, ${live.starts_at}::timestamptz + interval '1 hour',
              'unverified', 'Сеанс исчез из источника — информация уточняется', 'vanished', 'culture_ru:leo:leo-old')`);
    const dry = await cleanupReplacedSessions(db, { dryRun: true });
    expect(dry.replaced).toBe(1);
    expect((await db.execute(sql`SELECT 1 FROM occurrence WHERE event_id = ${ev}`)).rows).toHaveLength(2);
    const res = await cleanupReplacedSessions(db);
    expect(res.replaced).toBe(1);
    const rows = (await db.execute(sql`SELECT id, status FROM occurrence WHERE event_id = ${ev}`)).rows;
    expect(rows).toEqual([{ id: live.id, status: "scheduled" }]);
  });

  it("сеанс действительно пропал (другого на это время нет) — по-прежнему «уточняется»", async () => {
    await run([concert, cat(["leo-b", "leo-c"], ["12:00", "15:00"])]);
    await run([concert, cat(["leo-b"], ["12:00"])]);
    const rows = (
      await db.execute<{ status: string; status_reason: string | null }>(
        sql`SELECT status, status_reason FROM occurrence WHERE source_key = 'culture_ru:leo:leo-c'`,
      )
    ).rows;
    expect(rows).toEqual([{ status: "unverified", status_reason: "Сеанс исчез из источника" }]);
  });
});
