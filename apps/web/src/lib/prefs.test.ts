import { describe, expect, it } from "vitest";
import { cityFromCookie, guideCity } from "./prefs";

describe("город из куки afisha_city", () => {
  it("находит слаг среди других кук", () => {
    expect(cityFromCookie("a=1; afisha_city=ufa; b=2")).toBe("ufa");
    expect(cityFromCookie("afisha_city=sterlitamak")).toBe("sterlitamak");
  });

  it("пустая, чужая или подозрительная кука — null", () => {
    expect(cityFromCookie("")).toBeNull();
    expect(cityFromCookie("afisha_city=")).toBeNull();
    expect(cityFromCookie("x_afisha_city=ufa")).toBeNull();
    expect(cityFromCookie("afisha_city=<script>")).toBeNull();
  });
});

describe("город для Гида", () => {
  it("кука главнее localStorage: её же читает главная", () => {
    expect(guideCity("afisha_city=ufa", "neftekamsk")).toBe("ufa");
  });
  it("без куки — из localStorage, без обоих — undefined (вся республика)", () => {
    expect(guideCity("", "neftekamsk")).toBe("neftekamsk");
    expect(guideCity("", null)).toBeUndefined();
  });
});
