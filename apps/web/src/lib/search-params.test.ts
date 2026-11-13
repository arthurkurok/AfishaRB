import { describe, expect, it } from "vitest";
import {
  activeKeys,
  EMPTY_FILTERS,
  effectiveSort,
  filtersToApiQuery,
  filtersToParams,
  parseFilters,
  searchHref,
  withoutKey,
} from "./search-params";

describe("parseFilters", () => {
  it("разбирает все фильтры ТЗ и отбрасывает мусор", () => {
    const f = parseFilters(
      new URLSearchParams(
        "q=Буратино&when=weekend&time_of_day=morning,night&municipality=ufa,BAD%20SLUG&categories=theatre,kids,x&free=true&price_max=1000&age=5&pushkin=1&accessible=true&sort=price&near=54.7,55.9&radius_km=10",
      ),
    );
    expect(f).toMatchObject({
      q: "Буратино",
      when: "weekend",
      time_of_day: ["morning"],
      municipality: ["ufa"],
      categories: ["theatre", "kids"],
      free: true,
      price_max: 1000,
      age: 5,
      pushkin: true,
      accessible: true,
      sort: "price",
      near: "54.7,55.9",
      radius_km: 10,
    });
  });

  it("некорректные значения не применяются", () => {
    const f = parseFilters({ when: "yesterday", age: "42", date_from: "2026-13", sort: "x", radius_km: "1000" });
    expect(f.when).toBeNull();
    expect(f.age).toBeNull();
    expect(f.date_from).toBeNull();
    expect(f.sort).toBeNull();
    expect(f.radius_km).toBeNull();
  });
});

describe("сериализация", () => {
  it("URL ⇄ фильтры без потерь", () => {
    const qs =
      "q=%D0%BA%D0%BE%D0%BD%D1%86%D0%B5%D1%80%D1%82&when=today&municipality=ufa&categories=music&price_max=500&age=6&pushkin=true";
    expect(filtersToParams(parseFilters(new URLSearchParams(qs))).toString()).toBe(qs);
  });

  it("диапазон дат важнее «when», бесплатно важнее цены, геопозиция важнее города", () => {
    const p = filtersToParams({
      ...EMPTY_FILTERS,
      when: "today",
      date_from: "2026-11-07",
      date_to: "2026-11-08",
      free: true,
      price_max: 500,
      near: "54.7,55.9",
      radius_km: 3,
      municipality: ["ufa"],
    });
    expect(p.get("when")).toBeNull();
    expect(p.get("date_from")).toBe("2026-11-07");
    expect(p.get("price_max")).toBeNull();
    expect(p.get("municipality")).toBeNull();
    expect(p.get("radius_km")).toBe("3");
  });

  it("запрос к API: лента без текста — по дате, с текстом — по релевантности", () => {
    expect(effectiveSort(EMPTY_FILTERS)).toBe("date");
    expect(effectiveSort({ ...EMPTY_FILTERS, q: "театр" })).toBe("relevance");
    const api = filtersToApiQuery({ ...EMPTY_FILTERS, sort: "distance" }, { lang: "ba", limit: 12, cursor: "Mg" });
    expect(api.get("sort")).toBe("date");
    expect(api.get("lang")).toBe("ba");
    expect(api.get("limit")).toBe("12");
    expect(api.get("cursor")).toBe("Mg");
  });

  it("чипы активных фильтров снимаются по одному", () => {
    const f = parseFilters(new URLSearchParams("when=weekend&municipality=ufa&age=5&free=true"));
    expect(activeKeys(f)).toEqual(["when", "place", "price", "age"]);
    expect(activeKeys(withoutKey(f, "place"))).toEqual(["when", "price", "age"]);
  });

  it("searchHref", () => {
    expect(searchHref({})).toBe("/search");
    expect(searchHref({ categories: ["theatre"] })).toBe("/search?categories=theatre");
  });
});
