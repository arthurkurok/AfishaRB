/** HTTP API через fastify.inject: новые справочники, избранное без регистрации, правила ранжирования, Telegram initData. */
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "../src/db/client.js";
import { buildApp } from "../src/main/app.js";
import { verifyTelegramInitData } from "../src/modules/accounts/index.js";
import { RANKING_WEIGHTS } from "../src/modules/search/index.js";
import { at, fixture, nextSaturday, resetDb, seed } from "./helpers/db.js";

let app: FastifyInstance;
const sat = nextSaturday();

beforeAll(async () => {
  await resetDb();
  await seed([
    fixture("a1", { title: "Спектакль «Буратино»", categories: ["theatre", "kids"], start: at(sat, "11:00") }),
    fixture("a2", { title: "Спектакль «Теремок»", categories: ["theatre", "kids"], start: at(sat, "15:00") }),
    fixture("a3", {
      title: "Концерт «Счастье»",
      categories: ["music"],
      start: at(sat, "11:00"),
      venue: "v-sibay",
      muni: "sibay",
    }),
  ]);
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await closeDb();
});

describe("справочники и поиск", () => {
  it("учреждения ищутся по названию", async () => {
    const r = await app.inject({ url: "/v1/organizations?q=кукол" });
    expect(r.statusCode).toBe(200);
    expect(r.json()[0].name).toMatch(/Театр кукол/);
  });

  it("площадки фильтруются по муниципалитету", async () => {
    const r = await app.inject({ url: "/v1/venues?municipality=sibay" });
    expect(r.json().map((v: { municipality_id: string }) => v.municipality_id)).toEqual(["sibay"]);
  });

  it("сортировка «скоро заканчивается» и строгий free=false", async () => {
    const r = await app.inject({ url: `/v1/occurrences?sort=ending&free=false&date_from=${sat}&date_to=${sat}` });
    const ends = r.json().items.map((i: { ends_at: string }) => i.ends_at);
    expect(ends).toEqual([...ends].sort());
    expect(r.json().total).toBe(3);
  });

  it("похожие события: та же категория, без самого события", async () => {
    const list = await app.inject({ url: "/v1/occurrences?q=Буратино" });
    const id = list.json().items[0].event.id;
    const r = await app.inject({ url: `/v1/events/${id}/similar` });
    const titles = r.json().similar.map((c: { event: { title: string } }) => c.event.title);
    expect(titles).toContain("Спектакль «Теремок»");
    expect(titles).not.toContain("Спектакль «Буратино»");
  });

  it("правила ранжирования построены из тех же весов, что и поиск", async () => {
    const r = await app.inject({ url: "/v1/ranking-rules" });
    const text = r.json().factors.find((f: { code: string }) => f.code === "text");
    expect(text.weight).toBe(RANKING_WEIGHTS.text);
  });

  it("обратная связь по переводу принимается", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/v1/feedback",
      payload: { kind: "translation", text: "Неточность", original: "Бушлай", suggestion: "Түләүһеҙ", lang: "ba" },
    });
    expect(r.statusCode).toBe(202);
  });
});

describe("избранное без регистрации", () => {
  const device = { "x-device-id": "3f2a9c1e-0000-4000-8000-000000000001" };

  it("без идентификатора — 401", async () => {
    expect((await app.inject({ url: "/app/favorites" })).statusCode).toBe(401);
  });

  it("добавить → получить с ближайшим сеансом → удалить", async () => {
    const list = await app.inject({ url: "/v1/occurrences?q=Теремок" });
    const id = list.json().items[0].event.id;
    expect((await app.inject({ method: "PUT", url: `/app/favorites/${id}`, headers: device })).statusCode).toBe(204);
    const fav = await app.inject({ url: "/app/favorites", headers: device });
    expect(fav.json().event_ids).toEqual([id]);
    expect(fav.json().items[0].event.title).toBe("Спектакль «Теремок»");
    expect((await app.inject({ method: "DELETE", url: `/app/favorites/${id}`, headers: device })).statusCode).toBe(204);
    expect((await app.inject({ url: "/app/favorites", headers: device })).json().event_ids).toEqual([]);
  });
});

describe("Telegram initData", () => {
  const token = "123456:TEST-TOKEN";
  const sign = (fields: Record<string, string>) => {
    const check = Object.entries(fields)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    const hash = createHmac("sha256", secret).update(check).digest("hex");
    return new URLSearchParams({ ...fields, hash }).toString();
  };
  const now = Date.now();
  const fields = {
    auth_date: String(Math.floor(now / 1000)),
    query_id: "AAH",
    user: JSON.stringify({ id: 777, first_name: "Айгуль" }),
  };

  it("подлинные данные принимаются", () => {
    expect(verifyTelegramInitData(sign(fields), token, 3600, now)?.id).toBe(777);
  });
  it("подделка и устаревшие данные отклоняются", () => {
    const forged = sign(fields).replace("777", "778");
    expect(verifyTelegramInitData(forged, token, 3600, now)).toBeNull();
    expect(verifyTelegramInitData(sign(fields), "другой:токен", 3600, now)).toBeNull();
    expect(verifyTelegramInitData(sign(fields), token, 3600, now + 2 * 3600_000)).toBeNull();
  });
});

describe("кабинет учреждения", () => {
  const auth = { authorization: "Bearer dev-admin-token" };
  it("без токена — 401", async () => {
    expect((await app.inject({ method: "POST", url: "/admin/events", payload: {} })).statusCode).toBe(401);
  });
  it("создать событие → сразу в поиске, с журналом и уровнем доверия official_plus", async () => {
    const org = (await app.inject({ url: "/v1/organizations?q=кукол" })).json()[0];
    const venue = (await app.inject({ url: "/v1/venues?municipality=ufa" })).json()[0];
    const res = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: auth,
      payload: {
        organization_id: org.id,
        venue_id: venue.id,
        title: "Концерт «Курай в сердце»",
        summary: "Вечер башкирской музыки",
        categories: ["music", "folk"],
        age_rating: 6,
        starts_at: `${sat}T19:00:00+05:00`,
        price_min: 300,
      },
    });
    expect(res.statusCode).toBe(201);
    const found = (await app.inject({ url: `/v1/occurrences?q=${encodeURIComponent("Курай в сердце")}` })).json();
    expect(found.items[0].event.title).toBe("Концерт «Курай в сердце»");
    const detail = (await app.inject({ url: `/v1/events/${res.json().event_id}` })).json();
    expect(detail.provenance.trust_level).toBe("official_plus");
    expect(detail.history[0].text).toMatch(/добавлено/);
  });
  it("без возрастного знака — 400 (436-ФЗ)", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/admin/events",
      headers: auth,
      payload: { title: "Без возраста", categories: ["music"], starts_at: `${sat}T19:00:00+05:00` },
    });
    expect(r.statusCode).toBe(400);
  });
});
