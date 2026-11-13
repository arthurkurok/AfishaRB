/** Дедупликация на реальных парах из данных РБ (02.11.2026). Ложное слияние — худшая ошибка. */
import { describe, expect, it } from "vitest";
import { AUTO_MERGE, decide, normalizeTitle, REVIEW, scorePair } from "../src/modules/dedup/scoring.js";

const pair = (
  a: string,
  b: string,
  o: Partial<{ minutes: number; sameVenue: boolean; ageB: number; pa: number; pb: number }> = {},
) =>
  decide(
    scorePair({
      titleA: a,
      titleB: b,
      minutesApart: o.minutes ?? 0,
      sameVenue: o.sameVenue ?? true,
      distanceM: o.sameVenue === false ? 500 : 0,
      sameOrg: true,
      ageA: 6,
      ageB: o.ageB ?? 6,
      priceA: o.pa ?? null,
      priceB: o.pb ?? null,
    }).score,
  );

describe("dedup scoring", () => {
  it("убирает служебные слова и возрастной знак из названия", () => {
    expect(normalizeTitle("Спектакль «Буратино» 6+")).toBe("буратино");
  });

  it("сливает одинаковое событие в одном месте и времени", () => {
    expect(pair("Спектакль «Золотой осел Насретдина»", "«Золотой осёл Насретдина»")).toBe("merge");
    expect(pair("Познавательная программа«Мы едины»", "Познавательная программа«Мы едины»")).toBe("merge");
  });

  it.each([
    ["Командный исторический практикум «Сталинград»", "Командный исторический практикум «Победа»"],
    [
      "Командный исторический практикум «Революция»",
      "Командный исторический практикум «Комсомол: готов к труду и обороне!»",
    ],
    ["Выставка «С любовью к родине…»", "Экскурсия по выставке «С любовью к родине…»"],
    ["Лекция «Битва за Москву»", "Экскурсия «Битва за Берлин»"],
    ["Танцевальный кружок «Улыбочки»", "Танцевальный кружок«Рвезылык»"],
    ["Фотосессия 30 минут", "Фотосессия 60 минут"],
    ["Концерт «Весна», часть 1", "Концерт «Весна», часть 2"],
  ])("не сливает и не тратит время модератора: %s / %s", (a, b) => {
    expect(pair(a, b)).toBe("distinct");
  });

  it("далёкие по времени сеансы не сливаются автоматически", () => {
    expect(pair("Концерт «Весна»", "Концерт «Весна»", { minutes: 44, sameVenue: false })).not.toBe("merge");
  });

  it("порог проверки ниже порога слияния", () => {
    expect(REVIEW).toBeLessThan(AUTO_MERGE);
  });
});
