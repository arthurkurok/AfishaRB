import type { OccurrenceCard } from "@afisha/contract";
import { describe, expect, it } from "vitest";
import { groupByDay, mergePages } from "./grouping";

const o = (id: string, starts_at: string) => ({ id, starts_at }) as OccurrenceCard;

describe("лента по дням", () => {
  it("группирует по дате в поясе региона, а не UTC", () => {
    const groups = groupByDay(
      [o("a", "2026-11-07T11:00:00+05:00"), o("b", "2026-11-07T20:30:00Z"), o("c", "2026-11-08T09:00:00+05:00")],
      "Asia/Yekaterinburg",
    );
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ["2026-11-07", ["a"]],
      ["2026-11-08", ["b", "c"]],
    ]);
  });

  it("длительные события из прошлого — в первый день выдачи", () => {
    const groups = groupByDay(
      [o("x", "2026-10-01T10:00:00+05:00"), o("y", "2026-11-02T12:00:00+05:00")],
      "Asia/Yekaterinburg",
      "2026-11-02",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("склейка страниц без дублей", () => {
    expect(mergePages([o("a", ""), o("b", "")], [o("b", ""), o("c", "")]).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
