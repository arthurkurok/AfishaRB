/** Подписки на город и категорию + дайджест (ТЗ: разделы 3, 6.2, 12): API, отписка одной командой строки, идемпотентность уведомлений. */

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../src/db/client.js";
import { buildApp } from "../src/main/app.js";
import {
  digestText,
  isQuietHours,
  type OutgoingNotification,
  registerTransport,
  sendSubscriptionDigests,
  subscriptionTitle,
  subscriptionUrl,
} from "../src/modules/notify/index.js";
import { at, fixture, nextSaturday, resetDb, seed } from "./helpers/db.js";

let app: FastifyInstance;
const sat = nextSaturday();
const deviceA = { "x-device-id": "11111111-0000-4000-8000-00000000000a" };
const deviceB = { "x-device-id": "11111111-0000-4000-8000-00000000000b" };
let tgProfile: string;

beforeAll(async () => {
  await resetDb();
  // Telegram-профиль и его подписка существуют ДО появления «новых» событий —
  // дайджест считает новыми сеансы, созданные после подписки (o.created_at > since).
  tgProfile = (
    await getDb().execute<{ id: string }>(
      sql`INSERT INTO profile (channel, external_id, lang) VALUES ('telegram', '100200', 'ru') RETURNING id`,
    )
  ).rows[0]!.id;
  await getDb().execute(sql`
    INSERT INTO saved_search (profile_id, title, query, created_at, updated_at)
    VALUES (${tgProfile}, 'Уфа · Театр', ${JSON.stringify({ municipality: "ufa", categories: ["theatre"], period: null })}::jsonb, '2026-11-13T07:30:00Z', '2026-11-13T07:30:00Z')`);
  await seed(
    Array.from({ length: 6 }, (_, i) =>
      fixture(`t${i + 1}`, {
        title: `Спектакль «Театр №${i + 1}»`,
        categories: ["theatre"],
        start: at(sat, `${11 + i}:00`),
      }),
    ),
  );
  // фиксируем created_at сеансов — дайджест должен считать их «новыми» относительно подписки (07:30Z)
  await getDb().execute(sql`UPDATE occurrence SET created_at = '2026-11-13T07:45:00Z'`);
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("API подписок (X-Device-Id, без ПДн)", () => {
  it("без идентификатора устройства — 401", async () => {
    expect((await app.inject({ url: "/v1/subscriptions" })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "POST", url: "/v1/subscriptions", payload: { municipality: "ufa" } })).statusCode,
    ).toBe(401);
  });

  it("создать → в списке → отписаться: строка удаляется целиком", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/subscriptions",
      headers: deviceA,
      payload: { municipality: "ufa", categories: ["theatre", "music"] },
    });
    expect(r.statusCode).toBe(201);
    const sub = r.json();
    expect(sub.title).toBe("Уфа · Театр, Музыка");
    expect(sub.municipality).toBe("ufa");
    expect(sub.categories).toEqual(["theatre", "music"]);
    expect(sub.period).toBeNull();
    expect(sub.last_notified_at).toBeNull();

    const list = await app.inject({ url: "/v1/subscriptions", headers: deviceA });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0].id).toBe(sub.id);

    expect(
      (await app.inject({ method: "DELETE", url: `/v1/subscriptions/${sub.id}`, headers: deviceB })).statusCode,
    ).toBe(404); // чужая подписка не видна — 404, а не 403
    expect(
      (await app.inject({ method: "DELETE", url: `/v1/subscriptions/${sub.id}`, headers: deviceA })).statusCode,
    ).toBe(204);
    // жёсткое удаление: строки больше нет (ТЗ «отписка удаляет подписку»)
    const gone = await getDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM saved_search`);
    expect(gone.rows[0]!.n).toBe(1); // осталась только подписка telegram-профиля из beforeAll
    expect(
      (await app.inject({ method: "DELETE", url: `/v1/subscriptions/${sub.id}`, headers: deviceA })).statusCode,
    ).toBe(404);
    expect((await app.inject({ url: "/v1/subscriptions", headers: deviceA })).json().items).toEqual([]);
  });

  it("валидация: без фильтров и неизвестный город — 400", async () => {
    expect(
      (await app.inject({ method: "POST", url: "/v1/subscriptions", headers: deviceA, payload: {} })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/subscriptions",
          headers: deviceA,
          payload: { municipality: "london" },
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe("дайджест по подпискам", () => {
  const notes: OutgoingNotification[] = [];
  let ok = false;

  it("заголовок, ссылка и текст дайджеста — компактные и честные", () => {
    expect(subscriptionTitle("Уфа", ["theatre", "music"])).toBe("Уфа · Театр, Музыка");
    expect(subscriptionTitle(null, ["theatre"])).toBe("Вся республика · Театр");
    expect(subscriptionUrl("ufa", ["theatre"], "weekend")).toBe(
      "http://localhost:3000/search?municipality=ufa&categories=theatre&when=weekend",
    );
    const text = digestText(
      "Уфа · Театр",
      [{ starts_at: at(sat, "11:00"), title: "Спектакль №1", municipality: "Уфа" }],
      7,
    );
    expect(text).toContain("🔔 Новые события: Уфа · Театр");
    expect(text).toContain("Спектакль №1");
    expect(text).toContain("…и ещё 6"); // 7 всего, в сообщении — не больше 5
    expect(text).toContain("/unsubscribe");
    expect(isQuietHours(new Date("2026-11-13T18:30:00Z"))).toBe(true); // 23:30 Уфы
    expect(isQuietHours(new Date("2026-11-13T03:30:00Z"))).toBe(true); // 08:30 Уфы
    expect(isQuietHours(new Date("2026-11-13T08:30:00Z"))).toBe(false); // 13:30 Уфы
  });

  it("неудачная отправка не двигает last_notified_at — повтор в тот же день", async () => {
    const db = getDb();
    registerTransport("telegram", async (n) => {
      if (ok) notes.push(n);
      return ok;
    });
    const now = new Date("2026-11-13T08:00:00Z"); // 13:00 Уфы — не тихие часы
    const r1 = await sendSubscriptionDigests(db, now);
    expect(r1.due).toBe(1);
    expect(r1.sent).toBe(0); // транспорт не принял
    const rows = await db.execute<{ status: string }>(
      sql`SELECT status FROM notification WHERE profile_id = ${tgProfile} AND kind = 'digest' ORDER BY id`,
    );
    expect(rows.rows).toEqual([{ status: "failed" }]);

    ok = true;
    const r2 = await sendSubscriptionDigests(db, new Date(now.getTime() + 3600_000));
    expect(r2.sent).toBe(1); // повтор через час — успех
    expect(notes).toHaveLength(1);
    expect(notes[0]!.externalId).toBe("100200");
    expect(notes[0]!.text).toContain("Уфа · Театр");
    expect(notes[0]!.text).toContain("…и ещё 1"); // 6 новых, показано 5
    expect(notes[0]!.url).toContain("municipality=ufa");
    expect(notes[0]!.text).toContain("/unsubscribe");
  });

  it("повтор в течение суток молчит; через сутки без новых событий — тоже молчит", async () => {
    const db = getDb();
    const now = new Date("2026-11-13T08:00:00Z");
    const r3 = await sendSubscriptionDigests(db, new Date(now.getTime() + 2 * 3600_000));
    expect(r3.sent).toBe(0); // идемпотентность: не чаще раза в сутки
    // на следующий день дайджест «due», но новых сеансов с прошлого письма нет — тишина
    const r4 = await sendSubscriptionDigests(db, new Date(now.getTime() + 25 * 3600_000));
    expect(r4.sent).toBe(0);
    expect(r4.skipped).toBe(1);
    expect(notes).toHaveLength(1);
    // в журнале — одна отправленная и одна неудачная попытка
    const rows = await db.execute<{ status: string }>(
      sql`SELECT status FROM notification WHERE profile_id = ${tgProfile} AND kind = 'digest' ORDER BY id`,
    );
    expect(rows.rows).toEqual([{ status: "failed" }, { status: "sent" }]);
  });
});
