import { describe, expect, it } from "vitest";
import { compareEvents, dedupPayload, neighbours, priceText } from "./moderation";

const UFA = "Asia/Yekaterinburg";
const now = new Date("2026-11-02T10:00:00+05:00");

const base = {
  title: "Экскурсия по картинной галерее",
  organization: "МБУК «Галерея»",
  age_rating: 6,
  price: { min: "200.00", max: null, is_free: false, currency: "RUB" as const },
  categories: ["museum"] as ("museum" | "kids")[],
  provenance: {
    trust_level: "official" as const,
    sources: [{ id: "culture_ru", title: "Культура.РФ", url: null }],
    last_verified_at: null,
    freshness: "fresh" as const,
  },
  quality_score: 0.72,
  summary: "",
  occurrences: [
    {
      id: "1",
      venue: { id: "v", name: "Галерея", address: null, geo: null, municipality_id: "ufa", municipality: "Уфа" },
      starts_at: "2026-11-07T11:00:00+05:00",
      ends_at: null,
      is_range: false,
      status: "scheduled" as const,
      status_reason: null,
      previous_starts_at: null,
      availability: "unknown" as const,
      ticket_url: null,
      more_dates: 0,
      distance_km: null,
      reasons: [],
      freshness: "fresh" as const,
    },
  ],
};

describe("сравнение дублей бок о бок", () => {
  it("одинаковые поля не подсвечиваются, разные — подсвечиваются", () => {
    const b = { ...base, title: "Ночь искусств в картинной галерее", age_rating: 12 };
    const rows = compareEvents(base as never, b as never, UFA, (c) => (c === "museum" ? "Музеи и выставки" : c), now);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(by.title?.differs).toBe(true);
    expect(by.age?.differs).toBe(true);
    expect(by.venue?.differs).toBe(false);
    expect(by.when?.a).toBe("суббота, 7 ноября, 11:00");
    expect(by.categories?.a).toBe("Музеи и выставки");
    expect(by.quality?.a).toBe("72");
  });

  it("регистр и «ё» не считаются расхождением", () => {
    const b = { ...base, organization: "мбук «галерея»" };
    const rows = compareEvents(base as never, b as never, UFA, (c) => c, now);
    expect(rows.find((r) => r.key === "organization")?.differs).toBe(false);
  });

  it("цена текстом", () => {
    expect(priceText({ min: null, max: null, is_free: true, currency: "RUB" })).toBe("бесплатно");
    expect(priceText({ min: "300.00", max: "1500.00", is_free: false, currency: "RUB" }).replace(/\s/g, " ")).toBe(
      "300–1 500 ₽",
    );
    expect(priceText({ min: null, max: null, is_free: false, currency: "RUB" })).toBe("не указана");
  });
});

describe("очередь", () => {
  it("оценка и причины из payload", () => {
    expect(dedupPayload({ score: 0.858, reasons: ["та же площадка", 1] })).toEqual({
      score: 0.858,
      reasons: ["та же площадка"],
    });
    expect(dedupPayload(null)).toEqual({ score: null, reasons: [] });
  });

  it("соседние задачи по кругу", () => {
    expect(neighbours(["a", "b", "c"], "c")).toEqual({ prev: "b", next: "a", position: 3 });
    expect(neighbours(["a"], "a")).toEqual({ prev: null, next: null, position: 1 });
  });
});
