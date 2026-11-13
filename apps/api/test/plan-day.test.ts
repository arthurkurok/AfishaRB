import type { OccurrenceCard } from "@afisha/contract";
import { describe, expect, it } from "vitest";
import { planDay, travelMinutes } from "../src/modules/assistant/plan-day.js";

const card = (id: string, start: string, end: string, cat: string, geo: [number, number] = [54.73, 55.95]) =>
  ({
    id,
    event: {
      id: `e-${id}`,
      title: id,
      summary: "",
      categories: [cat],
      tags: [],
      age_rating: 0,
      pushkin_card: false,
      price: { min: null, max: null, is_free: true, currency: "RUB" },
      image: null,
      organization: null,
    },
    venue: { id: `v-${id}`, name: id, address: null, geo, municipality_id: "ufa", municipality: "Уфа" },
    starts_at: `2026-11-07T${start}:00+05:00`,
    ends_at: `2026-11-07T${end}:00+05:00`,
    is_range: false,
    status: "scheduled",
    status_reason: null,
    previous_starts_at: null,
    availability: "unknown",
    ticket_url: null,
    more_dates: 0,
    distance_km: null,
    reasons: [],
    freshness: "fresh",
  }) as unknown as OccurrenceCard;

describe("plan_day", () => {
  it("собирает непересекающийся маршрут с разными категориями", () => {
    const plan = planDay([
      card("museum", "11:00", "12:30", "museum"),
      card("museum2", "11:30", "13:00", "museum"),
      card("kids", "14:00", "15:00", "theatre"),
      card("overlap", "14:30", "16:00", "music"),
      card("concert", "19:00", "21:00", "music"),
    ]);
    expect(plan.map((p) => p.card.id)).toEqual(["museum", "kids", "concert"]);
  });

  it("учитывает дорогу между площадками", () => {
    const far = card("far", "12:40", "13:30", "theatre", [54.8, 56.1]); // ~12 км
    const near = card("first", "11:00", "12:30", "museum");
    expect(travelMinutes(near, far)).toBeGreaterThan(30);
    expect(planDay([near, far]).map((p) => p.card.id)).toEqual(["first"]);
  });
});
