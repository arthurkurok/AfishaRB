/**
 * Гид: «Сделай план на субботу…» (ТЗ, приложение А — контрольный запрос планировщика).
 * Ожидается маршрут из нескольких событий одного дня без пересечений, с общей стоимостью;
 * служебные глаголы («сделай», «составь») не уходят в полнотекстовый поиск ни в правилах, ни в LLM-режиме;
 * при несовместимых ограничениях — объяснение, что мешает.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, type Db } from "../src/db/client.js";
import type { AiGateway } from "../src/modules/assistant/gateway.js";
import { setGatewayForTests } from "../src/modules/assistant/gateway.js";
import { type AssistantResponseV2, handleAssistant } from "../src/modules/assistant/service.js";
import { at, fixture, nextSaturday, resetDb, seed } from "./helpers/db.js";

let db: Db;
const sat = nextSaturday();
// «сейчас» — пятница перед сид-субботой: «на субботу» указывает на сид-дату при любом дне запуска
const now = new Date(at(sat, "12:00").getTime() - 24 * 3600_000);

beforeAll(async () => {
  await resetDb();
  db = await seed([
    fixture("museum", {
      title: "Выставка «Уральские мастера»",
      categories: ["museum"],
      priceMin: "300.00",
      start: at(sat, "10:00"),
    }),
    fixture("theatre", {
      title: "Спектакль «Сказки леса»",
      categories: ["theatre"],
      priceMin: "400.00",
      start: at(sat, "13:00"),
    }),
    fixture("overlap", {
      title: "Лекция «Курай»",
      categories: ["education"],
      priceMin: "350.00",
      start: at(sat, "13:30"),
    }),
    fixture("concert", { title: "Концерт «Йыр»", categories: ["music"], priceMin: "250.00", start: at(sat, "18:00") }),
    fixture("pricey", {
      title: "Балет «Журавлиная песнь»",
      categories: ["theatre"],
      priceMin: "1500.00",
      start: at(sat, "16:00"),
    }),
  ]);
});
afterAll(async () => {
  setGatewayForTests(null);
  await closeDb();
});

const visitEnd = (p: AssistantResponseV2["picks"][number]) =>
  new Date(p.occurrence.ends_at ?? p.occurrence.starts_at).getTime();

function expectPlan(r: AssistantResponseV2, people: number, budget: number) {
  expect(r.kind).toBe("results");
  expect(r.slots.intent).toBe("plan_day");
  expect(r.slots.text).toBeNull();
  expect(r.chips.some((c) => /сделай|составь/i.test(c.label))).toBe(false);
  expect(r.picks.length).toBeGreaterThanOrEqual(2);
  expect(r.picks.length).toBeLessThanOrEqual(4);
  const sorted = [...r.picks].sort((a, b) => a.occurrence.starts_at.localeCompare(b.occurrence.starts_at));
  for (let i = 1; i < sorted.length; i++)
    expect(new Date(sorted[i]!.occurrence.starts_at).getTime()).toBeGreaterThanOrEqual(visitEnd(sorted[i - 1]!));
  for (const p of r.picks) expect(p.occurrence.starts_at.slice(0, 10)).toBe(sat);
  const total = r.picks.reduce((s, p) => s + Number(p.occurrence.event.price.min ?? 0) * people, 0);
  expect(total).toBeLessThanOrEqual(budget);
  expect(r.text).toMatch(/Маршрут/);
  expect(r.text).toContain(`${total.toLocaleString("ru-RU")} ₽`);
}

describe("Гид: план дня", () => {
  it("правила: «Сделай план на субботу в Уфе: три события, 2000 рублей на двоих» — маршрут с общей стоимостью", async () => {
    setGatewayForTests(null);
    const r = await handleAssistant(
      db,
      { text: "Сделай план на субботу в Уфе: три события, 2000 рублей на двоих" },
      { channel: "test", now },
    );
    expect(r.slots.adults).toBe(2);
    expectPlan(r, 2, 2000);
    expect(r.picks).toHaveLength(3);
  });

  it("LLM-режим: свободный текст модели «сделай» не становится текстовым слотом", async () => {
    const fake = {
      available: () => true,
      status: () => ({ providers: ["fake"], available: true, spentTokens: 0 }),
      embed: async () => null,
      chat: async (req: { json?: { name: string } }) => {
        if (req.json?.name === "extract_query")
          return {
            content: null,
            json: { intent: "search", categories: [], mood: [], free_text: "сделай", with_kids: false },
            finishReason: "function_call",
            model: "fake",
            provider: "sber",
            tokensIn: 1,
            tokensOut: 1,
            ms: 1,
          };
        throw new Error("отбор в плане дня не нужен");
      },
    } as unknown as AiGateway;
    setGatewayForTests(fake);
    const r = await handleAssistant(
      db,
      { text: "Сделай план на субботу в Уфе: три события, 2000 рублей на двоих" },
      { channel: "test", now },
    );
    setGatewayForTests(null);
    expectPlan(r, 2, 2000);
  });

  it("несовместимые ограничения: бюджет не позволяет два события — объяснение, что мешает", async () => {
    setGatewayForTests(null);
    const r = await handleAssistant(
      db,
      { text: "Составь план на субботу в Уфе: три события, 700 рублей на двоих" },
      { channel: "test", now },
    );
    expect(r.slots.intent).toBe("plan_day");
    expect(r.text).not.toMatch(/^Нашёл/);
    expect(r.text).toMatch(/бюджет/i);
    expect(r.text).toMatch(/700 ₽/);
  });
});
