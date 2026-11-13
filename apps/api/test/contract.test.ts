import { SearchQuery } from "@afisha/contract";
import { describe, expect, it } from "vitest";

describe("контракт: строка запроса", () => {
  it("free=false означает false, а не true (ловушка z.coerce.boolean)", () => {
    expect(SearchQuery.parse({ free: "false" }).free).toBe(false);
    expect(SearchQuery.parse({ free: "true" }).free).toBe(true);
    expect(SearchQuery.parse({ pushkin: "1" }).pushkin).toBe(true);
    expect(SearchQuery.parse({ group: "0" }).group).toBe(false);
  });
  it("списки через запятую", () => {
    expect(SearchQuery.parse({ municipality: "ufa,sterlitamak" }).municipality).toEqual(["ufa", "sterlitamak"]);
  });
});
