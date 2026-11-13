import type { EventDetail } from "@afisha/contract";
import { describe, expect, it } from "vitest";
import { eventToIcs, fold, icsEscape } from "./ics";
import { eventJsonLd, serializeJsonLd } from "./jsonld";

const occ = (over: Partial<EventDetail["occurrences"][number]> = {}) =>
  ({
    id: "o1",
    venue: {
      id: "v",
      name: "Театр кукол",
      address: "Уфа, ул. Гоголя, 60",
      geo: [54.73, 55.95],
      municipality_id: "ufa",
      municipality: "Уфа",
    },
    starts_at: "2026-11-07T11:00:00+05:00",
    ends_at: "2026-11-07T12:00:00+05:00",
    is_range: false,
    status: "scheduled",
    status_reason: null,
    previous_starts_at: null,
    availability: "unknown",
    ticket_url: "https://tickets.example/1",
    more_dates: 0,
    distance_km: null,
    reasons: [],
    freshness: "fresh",
    ...over,
  }) as EventDetail["occurrences"][number];

const event = {
  id: "e1",
  title: "Буратино; сказка, для всех",
  summary: "Кукольный спектакль",
  categories: ["theatre"],
  tags: [],
  age_rating: 0,
  pushkin_card: true,
  price: { min: "400.00", max: "800.00", is_free: false, currency: "RUB" },
  image: {
    url: "https://cdn.example/1.jpg",
    author: null,
    source: null,
    license: null,
    width: null,
    height: null,
    color: null,
  },
  organization: "Театр кукол РБ",
  description_html: "",
  images: [],
  languages: ["ru"],
  is_permanent: false,
  ticket_url: null,
  accessibility: {},
  occurrences: [
    occ(),
    occ({
      id: "o2",
      status: "rescheduled",
      starts_at: "2026-11-19T11:00:00+05:00",
      previous_starts_at: "2026-11-12T11:00:00+05:00",
    }),
    occ({ id: "o3", status: "cancelled" }),
  ],
  provenance: { trust_level: "official", sources: [], last_verified_at: null, freshness: "fresh" },
  history: [],
  source_url: null,
  quality_score: null,
} as unknown as EventDetail;

describe("iCalendar", () => {
  it("экранирование и сворачивание строк по RFC 5545", () => {
    expect(icsEscape("а;б,в\nг")).toBe(String.raw`а\;б\,в\nг`);
    const long = `SUMMARY:${"ж".repeat(60)}`;
    for (const line of fold(long).split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("сеансы в UTC, отменённый — STATUS:CANCELLED", () => {
    const ics = eventToIcs(event, "https://afisha.example/e/e1", { now: new Date("2026-11-02T10:00:00Z") });
    expect(ics).toContain("DTSTART:20261107T060000Z");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.split("BEGIN:VEVENT")).toHaveLength(4);
    expect(ics.replace(/\r\n /g, "")).toContain(String.raw`SUMMARY:Буратино\; сказка\, для всех (0+)`);
  });
});

describe("JSON-LD schema.org/Event", () => {
  it("eventStatus, previousStartDate и цены", () => {
    const ld = eventJsonLd(event, "https://afisha.example/e/e1") as { "@graph": Record<string, unknown>[] };
    const [a, b, c] = ld["@graph"];
    expect(a?.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(b?.eventStatus).toBe("https://schema.org/EventRescheduled");
    expect(b?.previousStartDate).toBe("2026-11-12T11:00:00+05:00");
    expect(c?.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(a?.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 400, highPrice: 800, priceCurrency: "RUB" });
    expect(a?.typicalAgeRange).toBe("0-");
  });

  it("сериализация безопасна для <script>", () => {
    expect(serializeJsonLd({ x: "</script><script>alert(1)" })).not.toContain("</script>");
  });
});
