/** Нормализация карточки Культура.РФ. */
import { describe, expect, it } from "vitest";
import {
  cleanUrl,
  collapseSessions,
  makeSummary,
  normalizeAge,
  normalizeCultureRu,
} from "../src/modules/ingestion/normalize-culture-ru.js";

const NOW = new Date("2026-11-02T10:00:00Z");

const place = (id: string, eipsk: number, localeIds = [1079, 200, 1]) => ({
  _id: id,
  eipskId: eipsk,
  title: "Театр кукол",
  address: "г. Уфа, ул. Гоголя, 63",
  localeIds,
  location: { type: "Point", coordinates: [55.95, 54.73] },
  locale: { _id: 1079, title: "Уфа", sysName: "respublika-bashkortostan-ufa" },
  saleLink: "https://tickets.example/x?utm_source=culture",
});

const detail = (over: Record<string, unknown> = {}) => ({
  _id: 101,
  name: "buratino",
  title: "Спектакль  «Буратино»",
  text: "[HTML]<p>Весёлая сказка&nbsp;для всей семьи.</p><script>alert(1)</script>[/HTML]",
  ageRestriction: 5,
  price: { min: 400, max: 700 },
  genres: [{ title: "Спектакли" }],
  tags: [{ title: "Для детей" }],
  places: [place("p1", 777), place("p-out", 999, [1563, 164, 1])],
  seances: [
    { _id: "s1", placeId: "p1", startDate: "2026-11-07T06:00:00.000Z", endDate: "2026-11-07T07:00:00.000Z" },
    { _id: "s-old", placeId: "p1", startDate: "2026-10-01T06:00:00.000Z", endDate: "2026-10-01T07:00:00.000Z" },
    { _id: "s-out", placeId: "p-out", startDate: "2026-11-08T06:00:00.000Z" },
  ],
  organizations: [{ _id: 5, title: "ГБУК Театр кукол", eipskOrganizationId: 55 }],
  thumbnailFile: { publicId: "abc", meta: { author: "Фотограф" }, width: 100, height: 50 },
  saleLink: "https://tickets.example/main?utm_campaign=1&a=2",
  ...over,
});

describe("normalizeCultureRu", () => {
  it("оставляет только площадки и сеансы РБ, будущие сеансы и стабильный ключ площадки", () => {
    const ne = normalizeCultureRu(detail(), { isPushkinsCard: true }, NOW)!;
    expect(ne.venues.map((v) => v.externalId)).toEqual(["777"]);
    expect(ne.sessions.map((s) => s.externalId)).toEqual(["s1"]);
    expect(ne.sessions[0]!.venueExternalId).toBe("777");
    expect(ne.venues[0]!.municipalityId).toBe("ufa");
  });

  it("возраст по 436-ФЗ округляется вверх, категории и теги определяются", () => {
    const ne = normalizeCultureRu(detail(), { isPushkinsCard: true }, NOW)!;
    expect(ne.ageRating).toBe(6);
    expect(ne.categories).toEqual(["theatre", "kids"]);
    expect(ne.tags).toContain("pushkin");
    expect(ne.pushkinCard).toBe(true);
  });

  it("санитизирует HTML и убирает трекинговые параметры из ссылок", () => {
    const ne = normalizeCultureRu(detail(), null, NOW)!;
    expect(ne.descriptionHtml).not.toContain("script");
    expect(ne.descriptionHtml).not.toContain("[/HTML]");
    expect(ne.summary).toBe("Весёлая сказка для всей семьи.");
    expect(ne.ticketUrl).toBe("https://tickets.example/main?a=2");
    expect(ne.title).toBe("Спектакль «Буратино»");
  });

  it("событие без площадок в РБ отбрасывается", () => {
    expect(normalizeCultureRu(detail({ places: [place("x", 1, [1563, 164, 1])] }), null, NOW)).toBeNull();
  });

  it("бесплатное событие получает тег free", () => {
    const ne = normalizeCultureRu(detail({ price: { min: 0, max: 0 } }), null, NOW)!;
    expect(ne.isFree).toBe(true);
    expect(ne.tags).toContain("free");
  });

  it("длинная серия ежедневных сеансов выставки сворачивается в интервал", () => {
    const sessions = Array.from({ length: 60 }, (_, i) => ({
      externalId: `d${i}`,
      venueExternalId: "777",
      startsAt: new Date(NOW.getTime() + i * 86400_000),
      endsAt: new Date(NOW.getTime() + i * 86400_000 + 8 * 3600_000),
      isRange: false,
      ticketUrl: null,
    }));
    const out = collapseSessions(sessions, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.isRange).toBe(true);
  });

  it("вспомогательные функции", () => {
    expect(normalizeAge(14)).toBe(16);
    expect(normalizeAge(undefined)).toBeNull();
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
    expect(makeSummary("а".repeat(10))).toBe("а".repeat(10));
  });
});

describe("HTML-сущности в метаданных источника", () => {
  it("автор фото и название раскодируются", () => {
    const ne = normalizeCultureRu(
      detail({
        title: "Концерт &laquo;Весна&raquo;",
        thumbnailFile: { publicId: "x", meta: { author: "ГБУ &quot;Театр&quot; &amp; Co" } },
      }),
      null,
      NOW,
    )!;
    expect(ne.title).toBe("Концерт «Весна»");
    expect(ne.images[0]!.author).toBe('ГБУ "Театр" & Co');
  });
});
