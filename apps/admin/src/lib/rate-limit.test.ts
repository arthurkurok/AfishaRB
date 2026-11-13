import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./rate-limit";

describe("ограничение попыток входа", () => {
  it("после N неудач — пауза до конца окна, потом снова можно", () => {
    const l = new AttemptLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) {
      expect(l.retryAfter("ip", 1_000 + i)).toBe(0);
      l.fail("ip", 1_000 + i);
    }
    expect(l.retryAfter("ip", 2_000)).toBe(59);
    expect(l.retryAfter("other", 2_000)).toBe(0);
    expect(l.retryAfter("ip", 61_001)).toBe(0);
  });

  it("успешный вход сбрасывает счётчик", () => {
    const l = new AttemptLimiter(1, 60_000);
    l.fail("ip", 0);
    expect(l.retryAfter("ip", 1)).toBeGreaterThan(0);
    l.reset("ip");
    expect(l.retryAfter("ip", 1)).toBe(0);
  });
});
