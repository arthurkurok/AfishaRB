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

  it("period: валидное значение проходит, мусор — по умолчанию month", () => {
    expect(parseOptions(attrs({ period: "weekend" }), defaults).period).toBe("weekend");
    expect(parseOptions(attrs({ period: "год" }), defaults).period).toBe("month");
    expect(parseOptions(attrs({}), defaults).period).toBe("month");
  });

  it("height: 360–1600, мусор и выход за границы — null", () => {
    expect(parseOptions(attrs({ height: "480" }), defaults).height).toBe(480);
    expect(parseOptions(attrs({ height: "360" }), defaults).height).toBe(360);
    expect(parseOptions(attrs({ height: "1600" }), defaults).height).toBe(1600);
    expect(parseOptions(attrs({ height: "100" }), defaults).height).toBeNull();
    expect(parseOptions(attrs({ height: "9999" }), defaults).height).toBeNull();
    expect(parseOptions(attrs({ height: "высоко" }), defaults).height).toBeNull();
    expect(parseOptions(attrs({}), defaults).height).toBeNull();
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

  it("period попадает в параметр when", () => {
    const o = parseOptions(attrs({ period: "today" }), defaults);
    expect(apiQuery(o).get("when")).toBe("today");
  });

  it("ссылки ведут на сайт с языковым префиксом", () => {
    const o = parseOptions(attrs({ lang: "ba", municipality: "ufa" }), defaults);
    expect(eventUrl(o, "abc")).toBe("https://afisha.example.ru/ba/e/abc");
    expect(siteSearchUrl(o)).toBe("https://afisha.example.ru/ba/search?municipality=ufa");
  });
});
