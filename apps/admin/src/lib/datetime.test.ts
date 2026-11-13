import { describe, expect, it } from "vitest";
import {
  formatOffset,
  formatSession,
  formatStamp,
  isoToZonedInputs,
  isValidDate,
  isValidTime,
  offsetMinutes,
  zonedToIso,
} from "./datetime";

const UFA = "Asia/Yekaterinburg";

describe("проверка ввода", () => {
  it("дата", () => {
    expect(isValidDate("2026-11-20")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("20.11.2026")).toBe(false);
    expect(isValidDate("")).toBe(false);
  });

  it("время", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("19:30")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:30")).toBe(false);
  });
});

describe("часовой пояс региона", () => {
  it("Уфа — UTC+5 круглый год", () => {
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), UFA)).toBe(300);
    expect(offsetMinutes(new Date("2026-07-15T12:00:00Z"), UFA)).toBe(300);
    expect(formatOffset(300)).toBe("+05:00");
    expect(formatOffset(-210)).toBe("-03:30");
    expect(formatOffset(0)).toBe("+00:00");
  });

  it("ввод «по Уфе» → RFC 3339 с офсетом региона, а не сервера", () => {
    expect(zonedToIso("2026-11-20", "19:00", UFA)).toBe("2026-11-20T19:00:00+05:00");
    // Полночь по Уфе — ещё предыдущий день по UTC
    expect(new Date(zonedToIso("2026-11-21", "00:30", UFA)).toISOString()).toBe("2026-11-20T19:30:00.000Z");
  });

  it("пояс с летним временем учитывается для конкретной даты", () => {
    expect(zonedToIso("2026-07-01", "12:00", "Europe/Berlin")).toBe("2026-07-01T12:00:00+02:00");
    expect(zonedToIso("2026-12-01", "12:00", "Europe/Berlin")).toBe("2026-12-01T12:00:00+01:00");
  });

  it("неверный ввод — исключение", () => {
    expect(() => zonedToIso("2026-13-01", "10:00", UFA)).toThrow(RangeError);
    expect(() => zonedToIso("2026-11-01", "25:00", UFA)).toThrow(RangeError);
  });

  it("момент времени → поля формы в поясе региона", () => {
    expect(isoToZonedInputs("2026-11-20T14:00:00Z", UFA)).toEqual({ date: "2026-11-20", time: "19:00" });
    expect(isoToZonedInputs("2026-11-20T21:30:00+00:00", UFA)).toEqual({ date: "2026-11-21", time: "02:30" });
  });
});

describe("форматирование", () => {
  const now = new Date("2026-11-02T10:00:00+05:00");

  it("сеанс: сегодня / завтра / дата с днём недели", () => {
    expect(formatSession("2026-11-02T19:00:00+05:00", UFA, now)).toBe("сегодня, 19:00");
    expect(formatSession("2026-11-03T11:00:00+05:00", UFA, now)).toBe("завтра, 11:00");
    expect(formatSession("2026-11-07T11:00:00+05:00", UFA, now)).toBe("суббота, 7 ноября, 11:00");
  });

  it("сеанс поздно вечером по UTC — уже следующий день в Уфе", () => {
    expect(formatSession("2026-11-02T20:00:00Z", UFA, now)).toBe("завтра, 01:00");
  });

  it("отметка времени для журналов", () => {
    expect(formatStamp("2026-11-02T14:48:19.675+00:00", UFA)).toBe("2 ноября 2026, 19:48");
  });
});
