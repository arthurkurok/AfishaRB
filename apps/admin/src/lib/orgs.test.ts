import { describe, expect, it } from "vitest";
import { mergeOrganizations } from "./orgs";

describe("учреждения из /v1/organizations", () => {
  it("строки одного учреждения по разным муниципалитетам склеиваются", () => {
    const id = "01a19c9d-493b-7b04-8639-4c11a8ce3475";
    const other = "01a19c9d-49bf-78fd-86ef-1ed0e683fc6a";
    const merged = mergeOrganizations([
      { id, name: "Театр оперы и балета", municipality: "Уфа", upcoming: 62 },
      { id: other, name: "Русский драмтеатр", municipality: "Уфа", upcoming: 97 },
      { id, name: "Театр оперы и балета", municipality: "Стерлитамак", upcoming: 1 },
      { id, name: "Театр оперы и балета", municipality: "Салават", upcoming: 1 },
    ]);
    expect(merged).toEqual([
      { id: other, name: "Русский драмтеатр", municipality: "Уфа", upcoming: 97 },
      { id, name: "Театр оперы и балета", municipality: "Уфа, Стерлитамак, Салават", upcoming: 64 },
    ]);
  });
});
