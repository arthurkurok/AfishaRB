import { describe, expect, it } from "vitest";
import {
  addDays,
  dayHeading,
  daysBetween,
  formatDate,
  formatDateTime,
  formatUntil,
  nextSaturday,
  regionParts,
  relativeTime,
  todayIn,
  weekdayIndex,
} from "../src/index";

describe("даты в поясе региона", () => {
  it("UTC-момент переводится в Asia/Yekaterinburg", () => {
    // 2026-11-07 20:30 UTC = 8 ноября 01:30 в Уфе
    expect(regionParts("2026-11-07T20:30:00Z")).toMatchObject({ date: "2026-11-08", time: "01:30" });
    expect(regionParts("2026-11-07T11:00:00+05:00")).toMatchObject({ date: "2026-11-07", time: "11:00" });
  });

  it("«сегодня» считается в поясе региона, а не в UTC", () => {
    expect(todayIn("Asia/Yekaterinburg", new Date("2026-11-01T20:00:00Z"))).toBe("2026-11-02");
  });

  it("арифметика дат", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-02", "2026-11-07")).toBe(5);
    expect(weekdayIndex("2026-11-07")).toBe(5); // суббота
    expect(nextSaturday("2026-11-02")).toBe("2026-11-07");
    expect(nextSaturday("2026-11-07")).toBe("2026-11-07");
    expect(nextSaturday("2026-11-08")).toBe("2026-11-14");
  });

  it("заголовки дней на ru и ba", () => {
    expect(dayHeading("2026-11-02", "ru", "2026-11-02")).toBe("Сегодня");
    expect(dayHeading("2026-11-03", "ba", "2026-11-02")).toBe("Иртәгә");
    expect(dayHeading("2026-11-07", "ru", "2026-11-02")).toBe("Суббота, 7 ноября");
    expect(dayHeading("2026-11-07", "ba", "2026-11-02")).toBe("Шәмбе, 7 ноябрь");
    expect(dayHeading("2027-01-10", "ru", "2026-11-02")).toBe("Воскресенье, 10 января 2027");
  });

  it("форматы дат", () => {
    expect(formatDate("2026-11-07", "ru")).toBe("7 ноября");
    expect(formatUntil("2027-02-23", "ru")).toBe("до 23 февраля");
    expect(formatUntil("2027-02-23", "ba")).toBe("23 февралгә тиклем");
    expect(formatDateTime("2026-11-02T19:00:00+05:00", "ru", "2026-11-02")).toBe("сегодня, 19:00");
    expect(formatDateTime("2026-11-07T11:00:00+05:00", "ba", "2026-11-02")).toBe("шәмбе, 7 ноябрь, 11:00");
  });

  it("относительное время", () => {
    const now = new Date("2026-11-02T15:00:00Z");
    expect(relativeTime("2026-11-02T14:59:40Z", "ru", now)).toBe("только что");
    expect(relativeTime("2026-11-02T14:20:00Z", "ru", now)).toBe("40 минут назад");
    expect(relativeTime("2026-11-02T14:39:00Z", "ru", now)).toBe("21 минуту назад");
    expect(relativeTime("2026-11-02T12:00:00Z", "ru", now)).toBe("3 часа назад");
    expect(relativeTime("2026-10-31T15:00:00Z", "ba", now)).toBe("2 көн элек");
  });
});
