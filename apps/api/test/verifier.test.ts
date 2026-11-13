import type { OccurrenceCard } from "@afisha/contract";
import { describe, expect, it } from "vitest";
import { verifyReason, verifySummary } from "../src/modules/assistant/verifier.js";

const card = {
  id: "o1",
  event: {
    id: "e1",
    title: "Спектакль «Буратино»",
    summary: "",
    categories: ["theatre", "kids"],
    tags: [],
    age_rating: 0,
    pushkin_card: false,
    price: { min: "400.00", max: "700.00", is_free: false, currency: "RUB" },
    image: null,
    organization: "Театр кукол",
  },
  venue: {
    id: "v1",
    name: "Башкирский театр кукол",
    address: null,
    geo: null,
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
  ticket_url: null,
  more_dates: 0,
  distance_km: null,
  reasons: [],
  freshness: "fresh",
} as unknown as OccurrenceCard;

describe("verifier", () => {
  it("пропускает фразу, где все факты из карточки", () => {
    expect(verifyReason("Кукольный спектакль 0+ в субботу, 7 ноября в 11:00, билет от 400 ₽.", card).ok).toBe(true);
  });
  it.each([
    ["Начало в 19:00.", /время/],
    ["Билет всего 99 ₽.", /цена/],
    ["Подходит детям 6+.", /возраст/],
    ["Покажут 8 ноября.", /дата/],
    ["Идёт в воскресенье.", /день недели/],
    ["Вход бесплатный.", /не бесплатное/],
    ["Лучший спектакль города.", /оценочное/],
    ["Есть бесплатная парковка.", /оценочное|непроверяемое/],
    ["Как и «Золушка», понравится детям.", /не из карточки/],
  ])("ловит ошибку: %s", (text, rx) => {
    const v = verifyReason(text, card);
    expect(v.ok).toBe(false);
    expect(v.problems.join(" ")).toMatch(rx);
  });
  it("сводка не может обещать больше карточек, чем показано", () => {
    expect(verifySummary("Нашёл 12 вариантов", 5).ok).toBe(false);
  });
});
