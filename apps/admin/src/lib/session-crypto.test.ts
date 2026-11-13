import { describe, expect, it } from "vitest";
import { newSession, resolveSecret, SESSION_TTL_MS, SessionConfigError, seal, unseal } from "./session-crypto";

const SECRET = "s".repeat(40);

describe("сессия в cookie", () => {
  it("запечатанная сессия не содержит токен в открытом виде и читается обратно", () => {
    const s = newSession("dev-admin-token", "ministry", 1_000);
    const sealed = seal(s, SECRET);
    expect(sealed).not.toContain("dev-admin-token");
    expect(Buffer.from(sealed, "base64url").toString("utf8")).not.toContain("dev-admin-token");
    expect(unseal(sealed, SECRET, 2_000)).toEqual(s);
  });

  it("другой секрет, подделка и мусор — нет сессии", () => {
    const sealed = seal(newSession("t", "institution"), SECRET);
    expect(unseal(sealed, "x".repeat(40))).toBeNull();
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith("A") ? "B" : "A"}A`;
    expect(unseal(tampered, SECRET)).toBeNull();
    expect(unseal("garbage", SECRET)).toBeNull();
    expect(unseal(undefined, SECRET)).toBeNull();
  });

  it("просроченная сессия отбрасывается", () => {
    const s = newSession("t", "ministry", 0);
    expect(s.exp).toBe(SESSION_TTL_MS);
    expect(unseal(seal(s, SECRET), SECRET, SESSION_TTL_MS + 1)).toBeNull();
  });

  it("в production без секрета вход отключён, в разработке — служебный секрет", () => {
    expect(() => resolveSecret({ NODE_ENV: "production" })).toThrow(SessionConfigError);
    expect(() => resolveSecret({ NODE_ENV: "production", ADMIN_SESSION_SECRET: "short" })).toThrow(SessionConfigError);
    expect(resolveSecret({ NODE_ENV: "production", ADMIN_SESSION_SECRET: SECRET })).toBe(SECRET);
    expect(resolveSecret({ NODE_ENV: "development" }).length).toBeGreaterThanOrEqual(32);
  });
});
