/**
 * Гид: сценарий из ТЗ и гарантия «выдуманных мероприятий нет».
 * Каждая карточка ответа должна существовать в БД; каждое объяснение — проходить верификатор.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, type Db } from "../src/db/client.js";
import type { AiGateway } from "../src/modules/assistant/gateway.js";
import { setGatewayForTests } from "../src/modules/assistant/gateway.js";
import { AssistantResponseV2, handleAssistant } from "../src/modules/assistant/service.js";
import { verifyReason } from "../src/modules/assistant/verifier.js";
import { at, fixture, nextSaturday, resetDb, seed } from "./helpers/db.js";

let db: Db;
const sat = nextSaturday();

beforeAll(async () => {
  await resetDb();
  db = await seed([
    fixture("kid0", {
      title: "Спектакль «Буратино»",
      categories: ["theatre", "kids"],
      ageRating: 0,
      priceMin: "400.00",
      start: at(sat, "11:00"),
    }),
    fixture("kid6", {
      title: "Спектакль «Сказание о семи батырах»",
      categories: ["theatre", "kids"],
      ageRating: 6,
      priceMin: "300.00",
      start: at(sat, "12:00"),
    }),
    fixture("adult", {
      title: "Спектакль «Всегда один»",
      categories: ["theatre"],
      ageRating: 16,
      priceMin: "700.00",
      start: at(sat, "18:00"),
    }),
    fixture("pricey", {
      title: "Мюзикл «Звезда»",
      categories: ["theatre", "kids"],
      ageRating: 0,
      priceMin: "1500.00",
      start: at(sat, "15:00"),
    }),
    fixture("cancel", {
      title: "Спектакль «Теремок»",
      categories: ["theatre", "kids"],
      ageRating: 0,
      priceMin: "200.00",
      start: at(sat, "10:00"),
    }),
    fixture("sibay", {
      title: "Концерт «Счастье»",
      categories: ["music"],
      ageRating: 0,
      isFree: true,
      priceMin: "0.00",
      priceMax: "0.00",
      start: at(sat, "11:00"),
      venue: "v-sibay",
      muni: "sibay",
    }),
  ]);
  // Отменённый сеанс не должен попадать в подборку
  await db.execute(sql`UPDATE occurrence SET status = 'cancelled' WHERE source_key LIKE 'culture_ru:cancel:%'`);
});
afterAll(async () => {
  setGatewayForTests(null);
  await closeDb();
});

async function assertGrounded(picks: { occurrence: { id: string; event: { id: string } }; reason_text: string }[]) {
  for (const p of picks) {
    const row = (
      await db.execute(
        sql`SELECT o.status FROM occurrence o WHERE o.id = ${p.occurrence.id} AND o.event_id = ${p.occurrence.event.id}`,
      )
    ).rows[0];
    expect(row, `карточка ${p.occurrence.id} должна существовать в БД`).toBeDefined();
    expect(["scheduled", "sold_out"]).toContain((row as { status: string }).status);
  }
}

describe("Гид в режиме правил", () => {
  it("сценарий из ТЗ: уточняет возраст и подбирает 0+ до 1000 ₽ в субботу", async () => {
    const r1 = await handleAssistant(
      db,
      { text: "Куда пойти в субботу с ребёнком до 1000 рублей", municipality_id: "ufa" },
      { channel: "test" },
    );
    expect(r1.kind).toBe("clarify");
    expect(r1.clarify?.slot).toBe("kids");
    const r2 = await handleAssistant(
      db,
      { conversation_id: r1.conversation_id, patch: { kids_ages: [5] } },
      { channel: "test" },
    );
    expect(r2.kind).toBe("results");
    const titles = r2.picks.map((p) => p.occurrence.event.title);
    expect(titles).toContain("Спектакль «Буратино»");
    expect(titles).not.toContain("Спектакль «Сказание о семи батырах»"); // 6+ не подходит пятилетнему
    expect(titles).not.toContain("Мюзикл «Звезда»"); // дороже бюджета
    expect(titles).not.toContain("Спектакль «Теремок»"); // отменён
    for (const p of r2.picks) {
      expect(p.occurrence.event.age_rating).toBeLessThanOrEqual(0);
      expect(p.occurrence.starts_at.slice(0, 10)).toBe(sat);
      expect(verifyReason(p.reason_text, p.occurrence).ok).toBe(true);
    }
    await assertGrounded(r2.picks);
  });

  it("просьба придумать событие — честный ответ и только реальные карточки", async () => {
    const r = await handleAssistant(db, { text: "Придумай концерт на субботу в Сибае" }, { channel: "test" });
    expect(r.text).toMatch(/не придумываю/);
    await assertGrounded(r.picks);
    expect(r.picks.every((p) => p.occurrence.venue?.municipality_id === "sibay")).toBe(true);
  });

  it("ничего нет — не выдумывает, а говорит прямо", async () => {
    const r = await handleAssistant(
      db,
      { text: "органный концерт в Сибае 31 декабря", municipality_id: "sibay" },
      { channel: "test" },
    );
    expect(["empty", "results"]).toContain(r.kind);
    await assertGrounded(r.picks);
    if (r.kind === "empty") expect(r.picks).toHaveLength(0);
  });

  it("вопрос не про культуру — вежливый отказ", async () => {
    const r = await handleAssistant(db, { text: "какая погода завтра?" }, { channel: "test" });
    expect(r.kind).toBe("offtopic");
    expect(r.picks).toHaveLength(0);
  });
});

describe("Гид с GigaChat (подставной провайдер, который ошибается)", () => {
  it("чужие ID отбрасываются, неверные факты заменяются шаблоном", async () => {
    const fake = {
      available: () => true,
      status: () => ({ providers: ["fake"], available: true, spentTokens: 0 }),
      embed: async () => null,
      chat: async (req: { json?: { name: string } }) => {
        if (req.json?.name === "extract_query") {
          return {
            content: null,
            json: { intent: "search", categories: [], mood: [], free_text: "", with_kids: true },
            finishReason: "function_call",
            model: "fake",
            provider: "sber",
            tokensIn: 1,
            tokensOut: 1,
            ms: 1,
          };
        }
        const body = JSON.parse((req as unknown as { messages: { content: string }[] }).messages[1]!.content) as {
          events: { id: string; title: string }[];
        };
        const real = body.events[0]!;
        return {
          content: null,
          json: {
            picks: [
              { id: "00000000-0000-0000-0000-000000000000", reason: "Выдуманный концерт «Призрак» в 20:00." },
              { id: real.id, reason: "Кукольный спектакль в 23:45 всего за 99 ₽ — лучший в городе." },
            ],
          },
          finishReason: "function_call",
          model: "fake",
          provider: "sber",
          tokensIn: 1,
          tokensOut: 1,
          ms: 1,
        };
      },
    } as unknown as AiGateway;
    setGatewayForTests(fake);
    const r = await handleAssistant(
      db,
      { text: "куда в субботу с ребёнком 5 лет до 1000", municipality_id: "ufa" },
      { channel: "test" },
    );
    expect(r.mode).toBe("llm");
    expect(r.kind).toBe("results");
    expect(r.picks.some((p) => p.occurrence.id === "00000000-0000-0000-0000-000000000000")).toBe(false);
    for (const p of r.picks) {
      expect(p.reason_text).not.toMatch(/23:45|99 ₽|лучший|Призрак/);
      expect(verifyReason(p.reason_text, p.occurrence).ok).toBe(true);
    }
    await assertGrounded(r.picks);
    // трассировка пишется в фоне — ждём её появления, а не полагаемся на порядок
    type Trace = { verifier: { rejected: number; problems: string[] } };
    let trace: Trace | undefined;
    for (let i = 0; i < 40 && !trace?.verifier?.problems?.length; i++) {
      trace = (await db.execute(sql`SELECT verifier FROM assistant_trace WHERE mode = 'llm' ORDER BY id DESC LIMIT 1`))
        .rows[0] as Trace | undefined;
      if (!trace?.verifier?.problems?.length) await new Promise((r) => setTimeout(r, 50));
    }
    if (!trace) throw new Error("нет трассировки");
    expect(trace.verifier.rejected).toBeGreaterThanOrEqual(1);
    expect(trace.verifier.problems.join(" ")).toMatch(/чужой id/);
    setGatewayForTests(null);
  });
});

describe("Гид: вопросы о событии и башкирский язык", () => {
  it("ответ о событии — только из карточки, неизвестное — «в карточке этого нет»", async () => {
    const ev = (await db.execute<{ id: string }>(sql`SELECT id FROM event WHERE title->>'ru' = 'Спектакль «Буратино»'`))
      .rows[0]!;
    const price = await handleAssistant(db, { event_id: ev.id, text: "Сколько стоят билеты?" }, { channel: "test" });
    expect(price.kind).toBe("answer");
    expect(price.text).toMatch(/от 400 ₽/);
    const age = await handleAssistant(db, { event_id: ev.id, text: "Можно ли с ребёнком 3 лет?" }, { channel: "test" });
    expect(age.text).toMatch(/0\+/);
    const parking = await handleAssistant(db, { event_id: ev.id, text: "Есть ли там парковка?" }, { channel: "test" });
    expect(parking.text).toMatch(/В карточке этого нет/);
  });

  it("запрос на башкирском — ответ на башкирском, служебные слова не уходят в поиск", async () => {
    const r = await handleAssistant(
      db,
      { text: "шәмбе көнө балалар менән ҡайҙа барырға", municipality_id: "ufa" },
      { channel: "test" },
    );
    expect(r.slots.text).toBeNull();
    expect(r.slots.with_kids).toBe(true);
    if (r.kind === "clarify") expect(r.text).toMatch(/нисә йәш/);
    // чипы тоже на башкирском
    const labels = r.chips.map((c) => c.label).join(" ");
    expect(labels).toMatch(/шәмбе|бала менән/);
    expect(labels).not.toMatch(/Суббота|с ребёнком/);
  });
});

describe("Гид: интеграция реестра инструментов (ТЗ 7.2)", () => {
  it("поиск идёт через инструмент search_events, grounds — показанные карточки из БД", async () => {
    const r = await handleAssistant(db, { text: "спектакли в Уфе", municipality_id: "ufa" }, { channel: "test" });
    expect(r.kind).toBe("results");
    expect(r.picks.length).toBeGreaterThan(0);
    expect(r.trace.steps.length).toBeGreaterThan(0);
    expect(r.trace.steps.some((s) => s.tool === "search_events")).toBe(true);
    // grounds — ровно показанные карточки, и только из БД
    expect(r.trace.grounds).toEqual(r.picks.map((p) => p.occurrence.id));
    await assertGrounded(r.picks);
    expect(r.confirm).toBeNull();
    // расширенный ответ по-прежнему проходит контракт ассистента (надмножество полей)
    expect(() => AssistantResponseV2.parse(r)).not.toThrow();
  });

  it("подписка без DI-колбэка — честный отказ вместо тихого «успеха»", async () => {
    const r = await handleAssistant(db, { text: "подпишись на спектакли в Уфе" }, { channel: "test" });
    expect(r.kind).toBe("answer");
    expect(r.text).toMatch(/подписки пока недоступны/iu);
    expect(r.confirm).toBeNull();
    // действие не выполнялось: шага subscribe в трассе нет
    expect(r.trace.steps.every((s) => s.tool !== "subscribe")).toBe(true);
  });
});
