import type { OccurrenceCard } from "@afisha/contract";
import { createT } from "@afisha/i18n/messages";
import { describe, expect, it } from "vitest";
import {
  cardSpeech,
  dateBadge,
  decodeEntities,
  priceLabel,
  priceShort,
  routeLinks,
  statusKind,
  statusLabel,
} from "./format";

const tRu = createT("ru");
const tBa = createT("ba");
const TZ = "Asia/Yekaterinburg";
const price = (min: string | null, max: string | null, is_free = false) => ({
  min,
  max,
  is_free,
  currency: "RUB" as const,
});

const card = (over: Partial<OccurrenceCard> = {}): OccurrenceCard =>
  ({
    id: "o1",
    event: {
      id: "e1",
      title: "Спектакль «Буратино»",
      summary: "",
      categories: ["theatre"],
      tags: [],
      age_rating: 0,
      pushkin_card: false,
      price: price("400.00", null),
      image: null,
      organization: null,
    },
    venue: { id: "v", name: "Театр кукол", address: null, geo: null, municipality_id: "ufa", municipality: "Уфа" },
    starts_at: "2026-11-07T11:00:00+05:00",
    ends_at: null,
    is_range: false,
    status: "scheduled",
    status_reason: null,
    previous_starts_at: null,
    availability: "few_left",
    ticket_url: null,
    more_dates: 0,
    distance_km: null,
    reasons: [],
    freshness: "fresh",
    ...over,
  }) as OccurrenceCard;

describe("цена", () => {
  it("варианты подписи", () => {
    expect(priceLabel(price("0.00", "0.00", true), tRu)).toBe("Бесплатно");
    expect(priceLabel(price("400.00", "1200.00"), tRu)).toBe("400–1 200 ₽");
    expect(priceLabel(price("500.00", "500.00"), tRu)).toBe("500 ₽");
    expect(priceLabel(price("400.00", null), tRu)).toBe("от 400 ₽");
    expect(priceLabel(price(null, null), tRu)).toBe("Цена уточняется");
    expect(priceShort(price("300.00", "500.00"), tBa)).toBe("300 ₽-дан");
  });
});

describe("статус", () => {
  it("статус передаётся текстом; «мало билетов» — из availability", () => {
    expect(statusKind(card())).toBe("few_left");
    expect(statusKind(card({ availability: "unknown" }))).toBeNull();
    expect(statusLabel(card({ status: "cancelled" }), tRu, "ru", TZ)).toBe("Отменено");
    expect(statusLabel(card({ status: "rescheduled", starts_at: "2026-11-19T19:00:00+05:00" }), tRu, "ru", TZ)).toBe(
      "Перенесено → 19 ноября",
    );
    expect(statusLabel(card({ status: "postponed" }), tBa, "ba", TZ)).toBe("Күсерелде, яңы көнө аныҡлана");
  });
});

describe("дата в ромбе и фраза для скринридера", () => {
  it("обычный сеанс", () => {
    expect(dateBadge(card(), "ru", TZ, "2026-11-02")).toMatchObject({ top: "ноя", day: "7", bottom: "11:00" });
  });
  it("идущая выставка показывает дату окончания", () => {
    const b = dateBadge(
      card({ is_range: true, starts_at: "2026-10-01T10:00:00+05:00", ends_at: "2027-02-23T18:00:00+05:00" }),
      "ba",
      TZ,
      "2026-11-02",
    );
    expect(b).toMatchObject({ top: "фев", day: "23", bottom: "тиклем", label: "23 февралгә тиклем" });
  });
  it("карточка читается одной фразой (07-design §11)", () => {
    expect(cardSpeech(card(), tRu, "ru", TZ, "2026-11-02")).toBe(
      "Спектакль «Буратино», 0+, суббота, 7 ноября, 11:00, Театр кукол, от 400 ₽, Осталось мало билетов",
    );
  });
});

describe("прочее", () => {
  it("HTML-сущности из источников", () => {
    expect(decodeEntities("МАУК&quot;РДК&quot;")).toBe('МАУК"РДК"');
  });
  it("маршрут по координатам", () => {
    expect(routeLinks([54.73, 55.95], null).yandex).toContain("rtext=~54.73,55.95");
  });
});
