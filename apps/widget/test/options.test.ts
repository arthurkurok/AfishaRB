import { describe, expect, it } from "vitest";
import { apiQuery, eventUrl, parseOptions, siteSearchUrl } from "../src/options";

const defaults = { apiBase: "https://api.example.ru", siteBase: "https://afisha.example.ru" };
const attrs = (o: Record<string, string>) => (name: string) => o[name] ?? null;

describe("parseOptions", () => {
  it("значения по умолчанию", () => {
    const o = parseOptions(attrs({}), defaults);
    expect(o).toMatchObject({ layout: "carousel", limit: 8, lang: "ru", theme: "auto", free: false, age: null });
    expect(o.apiBase).toBe(defaults.apiBase);
  });

  it("валидирует атрибуты и отбрасывает мусор", () => {
    const o = parseOptions(
      attrs({
        municipality: "ufa,Bad Slug!,sterlitamak",
        categories: "theatre,unknown,music",
        layout: "grid",
        limit: "500",
        age: "5",
        free: "",
        accent: "red; background:url(x)",
        radius: "8",
        lang: "ba-RU",
        theme: "dark",
        venue: "not-a-uuid",
        "api-base": "javascript:alert(1)",
      }),
      defaults,
    );
    expect(o.municipality).toEqual(["ufa", "sterlitamak"]);
    expect(o.categories).toEqual(["theatre", "music"]);
    expect(o.layout).toBe("grid");
    expect(o.limit).toBe(24);
    expect(o.age).toBe(5);
    expect(o.free).toBe(true);
    expect(o.accent).toBeNull();
    expect(o.radius).toBe(8);
    expect(o.lang).toBe("ba");
    expect(o.theme).toBe("dark");
    expect(o.venue).toBeNull();
    expect(o.apiBase).toBe(defaults.apiBase);
  });

  it('free="false" выключает фильтр', () => {
    expect(parseOptions(attrs({ free: "false" }), defaults).free).toBe(false);
  });
});

describe("запросы и ссылки", () => {
  it("apiQuery содержит только заданные фильтры", () => {
    const o = parseOptions(attrs({ municipality: "ufa", pushkin: "true", age: "0", limit: "4" }), defaults);
    const q = apiQuery(o);
    expect(Object.fromEntries(q)).toEqual({
      when: "month",
      municipality: "ufa",
      pushkin: "true",
      age: "0",
      lang: "ru",
      limit: "4",
    });
  });

  it("ссылки ведут на сайт с языковым префиксом", () => {
    const o = parseOptions(attrs({ lang: "ba", municipality: "ufa" }), defaults);
    expect(eventUrl(o, "abc")).toBe("https://afisha.example.ru/ba/e/abc");
    expect(siteSearchUrl(o)).toBe("https://afisha.example.ru/ba/search?municipality=ufa");
  });
});
