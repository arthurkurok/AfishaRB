import { describe, expect, it } from "vitest";
import { Dashboard, pgTimestampToIso } from "./admin-types";
import { toCsv } from "./csv";
import {
  categoriesText,
  formatPercent,
  isPulseTable,
  PULSE_TABLES,
  parsePeriod,
  printable,
  share,
  sourceHealth,
  sourceStatsText,
  tableRows,
} from "./pulse";
import { averageIndex, missingParts, qualityHints, qualityLevel, sortQuality } from "./quality";

const now = new Date("2026-11-02T20:00:00+05:00");

describe("метки времени PostgreSQL", () => {
  it("«2026-11-02 14:48:19.675+00» → ISO 8601", () => {
    expect(pgTimestampToIso("2026-11-02 14:48:19.675+00")).toBe("2026-11-02T14:48:19.675+00:00");
    expect(pgTimestampToIso("2026-11-02 14:48:19+0530")).toBe("2026-11-02T14:48:19+05:30");
    expect(new Date(pgTimestampToIso("2026-11-02 14:48:19.675+00")).toISOString()).toBe("2026-11-02T14:48:19.675Z");
  });
});

describe("период", () => {
  it("только 7 / 30 / 90, по умолчанию 30", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod(["90"])).toBe(90);
    expect(parsePeriod("365")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
  });
});

describe("показатели", () => {
  it("доля и проценты", () => {
    expect(share(6, 685)).toBeCloseTo(0.00876, 4);
    expect(share(1, 0)).toBeNull();
    expect(formatPercent(0.0088).replace(/\s/g, " ")).toBe("0,9 %");
    expect(formatPercent(null)).toBe("—");
  });

  it("управляющие символы в запросах видны, а не исчезают", () => {
    expect(printable("|\u0001Q ")).toBe("|\uFFFDQ");
    expect(printable("балет в уфе")).toBe("балет в уфе");
  });

  it("категории из кодов API", () => {
    expect(categoriesText("theatre, kids")).toBe("Театр, Детям");
    expect(categoriesText(null)).toBe("любые");
    expect(categoriesText("cinema, music, music, cinema")).toBe("Кино, Музыка");
  });
});

describe("здоровье источников", () => {
  it("свежий сбор — работает", () => {
    expect(
      sourceHealth({ last_success_at: "2026-11-02T14:48:19.675+00:00", last_stats: { errors: 0 } }, now).kind,
    ).toBe("ok");
  });

  it("ошибки в последнем сборе", () => {
    expect(sourceHealth({ last_success_at: "2026-11-02T14:00:00+00:00", last_stats: { errors: 3 } }, now)).toEqual({
      kind: "stale",
      label: "Работает, есть ошибки: 3",
    });
  });

  it("давно не обновлялся и сбой", () => {
    expect(sourceHealth({ last_success_at: "2026-11-01T20:00:00+00:00", last_stats: {} }, now).kind).toBe("stale");
    expect(sourceHealth({ last_success_at: "2026-10-30T20:00:00+00:00", last_stats: {} }, now).kind).toBe("failing");
  });

  it("ручные источники без сбора и источник, который ни разу не собрался", () => {
    expect(sourceHealth({ last_success_at: null, last_stats: {} }, now).kind).toBe("manual");
    expect(sourceHealth({ last_success_at: null, last_stats: { errors: 1 } }, now).kind).toBe("failing");
  });

  it("сводка статистики", () => {
    expect(
      sourceStatsText({ eventsNew: 5650, eventsUpdated: 0, occurrencesNew: 20406, errors: 0 }).replace(/\s/g, " "),
    ).toBe("новых событий 5 650, обновлено 0, новых сеансов 20 406");
    expect(sourceStatsText({})).toBe("—");
  });
});

describe("качество данных", () => {
  const rows = [
    { id: "a", name: "Б-музей", events: 3, avg_quality: 80, no_image: 0, no_price: 1 },
    { id: "b", name: "А-театр", events: 10, avg_quality: 40, no_image: 5, no_price: 0 },
    { id: "c", name: "В-клуб", events: 1, avg_quality: null, no_image: 1, no_price: 1 },
  ];

  it("по умолчанию — сначала худшие, неизвестный индекс самым первым", () => {
    expect(sortQuality(rows, "avg_quality", "asc").map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(sortQuality(rows, "avg_quality", "desc").map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortQuality(rows, "name", "asc").map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(sortQuality(rows, "events", "desc").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("уровень индекса", () => {
    expect(qualityLevel(30)).toBe("low");
    expect(qualityLevel(60)).toBe("mid");
    expect(qualityLevel(90)).toBe("high");
  });

  const detail = {
    images: [],
    image: null,
    description_html: "<p>Коротко</p>",
    price: { min: null, max: null, is_free: false, currency: "RUB" as const },
    ticket_url: null,
    accessibility: {},
    occurrences: [{ venue: { geo: null } }],
  } as unknown as Parameters<typeof missingParts>[0];

  it("чего не хватает карточке — по формуле индекса", () => {
    expect(missingParts(detail).map((p) => p.key)).toEqual([
      "image",
      "description",
      "price",
      "tickets",
      "accessibility",
      "geo",
    ]);
    const free = { ...detail, price: { ...detail.price, is_free: true } };
    expect(missingParts(free).map((p) => p.key)).not.toContain("tickets");
  });

  it("подсказки: сначала то, что даёт больше баллов", () => {
    const full = {
      ...detail,
      images: [{}],
      description_html: `<p>${"а".repeat(320)}</p>`,
      price: { ...detail.price, min: "300.00" },
      ticket_url: "https://x.ru",
      accessibility: { ramp: true },
      occurrences: [{ venue: { geo: [54, 56] } }],
    } as unknown as Parameters<typeof missingParts>[0];
    const hints = qualityHints([detail, detail, full]);
    expect(hints[0]?.key).toBe("image");
    expect(hints[0]?.text).toContain("2 событий");
    expect(qualityHints([full])).toEqual([]);
  });

  it("средний индекс 0–100", () => {
    expect(averageIndex([0.5, 0.7, null])).toBe(60);
    expect(averageIndex([])).toBeNull();
  });
});

describe("таблицы выгрузки", () => {
  const dashboard = Dashboard.parse({
    period_days: 30,
    totals: {
      events: 1,
      occurrences: 2,
      municipalities_covered: 1,
      municipalities_total: 2,
      searches: 10,
      zero_results: 1,
      assistant_dialogs: 0,
    },
    culture_deserts: [{ id: "x", name: "Х район", upcoming: 1 }],
    supply: [{ id: "x", name: "Х район", kind: "district", upcoming: 1, free: 0, pushkin: 1, kids: 0 }],
    by_category: [{ code: "theatre", n: 5 }],
    demand_top: [{ query: "=1+1", n: 3, avg_results: 0 }],
    demand_without_supply: [
      { municipality: "Нефтекамск", categories: "kids", with_kids: true, n: 210, example: "детский спектакль" },
    ],
    data_quality: [],
    sources: [
      { id: "culture_ru", title: "Культура.РФ", last_success_at: "2026-11-02 14:48:19.675+00", last_stats: {} },
    ],
    moderation: [{ kind: "dedup_review", open: 29 }],
  });

  it("все таблицы известны и выгружаются", () => {
    expect(isPulseTable("demand-gaps")).toBe(true);
    expect(isPulseTable("__proto__")).toBe(false);
    for (const slug of Object.keys(PULSE_TABLES) as (keyof typeof PULSE_TABLES)[]) {
      const table = PULSE_TABLES[slug];
      const csv = toCsv(table.columns as never, tableRows(dashboard, slug) as never, { bom: false });
      expect(csv.split("\r\n")[0]).toBe(table.columns.map((c) => c.header).join(";"));
    }
  });

  it("«Спрос без предложения» — по-русски, формулы в запросах обезврежены", () => {
    const gaps = PULSE_TABLES["demand-gaps"];
    expect(toCsv(gaps.columns, dashboard.demand_without_supply, { bom: false })).toContain(
      "Нефтекамск;Детям;да;210;детский спектакль",
    );
    expect(toCsv(PULSE_TABLES.queries.columns, dashboard.demand_top, { bom: false })).toContain("'=1+1;3;0");
    expect(toCsv(PULSE_TABLES.sources.columns, dashboard.sources, { bom: false })).toContain("2 ноября 2026, 19:48");
    expect(toCsv(PULSE_TABLES.moderation.columns, dashboard.moderation, { bom: false })).toContain(
      "Возможные дубли;29",
    );
  });
});
