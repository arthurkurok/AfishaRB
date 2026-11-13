/** Время региона: «сегодня» считается в Asia/Yekaterinburg, а не в поясе сервера. */
import { describe, expect, it } from "vitest";
import { addDays, humanDate, localParts, startOfLocalDay, toRegionIso, weekdayOf } from "../src/modules/geo/time.js";

describe("region time", () => {
  it("23:30 по Уфе — ещё тот же день, хотя в UTC это 18:30", () => {
    const d = new Date("2026-11-07T18:30:00Z");
    expect(localParts(d).date).toBe("2026-11-07");
    expect(localParts(d).hour).toBe(23);
  });

  it("00:30 по Уфе — уже следующий день, хотя в UTC ещё предыдущий", () => {
    const d = new Date("2026-11-07T19:30:00Z");
    expect(localParts(d).date).toBe("2026-11-08");
  });

  it("начало локального дня — 19:00 UTC предыдущих суток", () => {
    expect(startOfLocalDay("2026-11-08").toISOString()).toBe("2026-11-07T19:00:00.000Z");
  });

  it("форматирует с офсетом +05:00", () => {
    expect(toRegionIso(new Date("2026-11-07T06:00:00Z"))).toBe("2026-11-07T11:00:00+05:00");
  });

  it("дни недели и арифметика дат", () => {
    expect(weekdayOf("2026-11-07")).toBe(6); // суббота
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(humanDate("2026-11-07")).toBe("Суббота, 7 ноября");
    expect(humanDate("2026-11-07", "ba")).toBe("7 ноябрь, шәмбе");
  });
});
