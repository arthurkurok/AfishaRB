import { describe, expect, it } from "vitest";
import { formatMessage, placeholders } from "../src/index";

describe("formatMessage", () => {
  it("подстановки", () => {
    expect(formatMessage("Привет, {name}!", { name: "Бал" })).toBe("Привет, Бал!");
    expect(formatMessage("{a} и {b}", { a: 1 })).toBe("1 и ");
  });

  it("plural с вложенными подстановками и точным значением", () => {
    const m = "{n, plural, =0 {нет дат} one {# дата в {city}} few {# даты} many {# дат} other {# даты}}";
    expect(formatMessage(m, { n: 0 })).toBe("нет дат");
    expect(formatMessage(m, { n: 21, city: "Уфе" })).toBe("21 дата в Уфе");
    expect(formatMessage(m, { n: 2 })).toBe("2 даты");
    expect(formatMessage(m, { n: 25 })).toBe("25 дат");
  });

  it("незакрытая скобка не ломает строку", () => {
    expect(formatMessage("текст {без конца")).toBe("текст {без конца");
  });

  it("placeholders", () => {
    expect(placeholders("{count, plural, one {# x} other {# y}} в {city}")).toEqual(["city", "count"]);
  });
});
