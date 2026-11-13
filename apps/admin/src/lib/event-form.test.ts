import { describe, expect, it } from "vitest";
import type { EventDraft } from "./admin-types";
import {
  coerceFormValues,
  draftToValues,
  emptyValues,
  fieldConfidence,
  relevantWarnings,
  validateEventForm,
} from "./event-form";

const UFA = "Asia/Yekaterinburg";
const now = new Date("2026-11-02T10:00:00+05:00");
const ORG = "01a19c9d-49b2-7f66-ae32-b32390ee83f4";
const VENUE = "01a19c9d-49b3-769c-b46d-50086259b6c2";

const draft: EventDraft = {
  title: "Лиса-сирота",
  summary: "Спектакль на башкирском языке для всей семьи.",
  categories: ["theatre", "kids", "unknown"],
  date_from: "2026-11-15",
  date_to: "2026-11-15",
  time: "11:00",
  age_rating: 0,
  is_free: false,
  price_min: 300,
  confidence: { date: 0.9, time: 0.9, age: 0.95, title: 0.6, categories: 0.6 },
  mode: "rules",
  warnings: [
    "Укажите возрастной знак (0+, 6+, 12+, 16+, 18+) — без него событие не публикуется (436-ФЗ).",
    "ИИ временно недоступен — поля заполнены по правилам.",
  ],
};

describe("черновик → форма", () => {
  it("переносит найденные поля, отбрасывает незнакомые категории, возраст 0+ не теряется", () => {
    const v = draftToValues(draft, ORG, VENUE);
    expect(v).toMatchObject({
      organization_id: ORG,
      venue_id: VENUE,
      title: "Лиса-сирота",
      categories: ["theatre", "kids"],
      age_rating: "0",
      date: "2026-11-15",
      time: "11:00",
      price_min: "300",
    });
  });

  it("недопустимый возрастной знак не подставляется", () => {
    expect(draftToValues({ ...draft, age_rating: 3 }, ORG).age_rating).toBe("");
  });

  it("уверенность: высокая, проверить, не найдено", () => {
    const v = draftToValues(draft, ORG);
    expect(fieldConfidence(draft, "date", v)).toBe("high");
    expect(fieldConfidence(draft, "title", v)).toBe("check");
    expect(fieldConfidence({ ...draft, confidence: { ...draft.confidence, time: 0 } }, "time", v)).toBe("missing");
    expect(fieldConfidence(draft, "summary", v)).toBeNull();
    expect(fieldConfidence(null, "title", v)).toBeNull();
  });

  it("предупреждение о возрасте убирается, если возраст найден (0+ — тоже возраст)", () => {
    expect(relevantWarnings(draft)).toEqual(["ИИ временно недоступен — поля заполнены по правилам."]);
    expect(relevantWarnings({ ...draft, age_rating: null })).toHaveLength(2);
  });
});

describe("проверка формы схемой CabinetEventCreate", () => {
  const valid = { ...draftToValues(draft, ORG, VENUE), ticket_url: "https://teatrkukol-ufa.ru/afisha/" };

  it("корректная форма → тело запроса с +05:00", () => {
    const res = validateEventForm(valid, UFA, now);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toMatchObject({
        organization_id: ORG,
        venue_id: VENUE,
        age_rating: 0,
        starts_at: "2026-11-15T11:00:00+05:00",
        price_min: 300,
        is_free: false,
        pushkin_card: false,
        categories: ["theatre", "kids"],
      });
      expect(res.data.ends_at).toBeUndefined();
    }
  });

  it("пустая форма — ошибки по всем обязательным полям", () => {
    const res = validateEventForm(emptyValues(ORG), UFA, now);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(Object.keys(res.errors).sort()).toEqual(["age_rating", "categories", "date", "time", "title", "venue_id"]);
      expect(res.errors.age_rating).toContain("436-ФЗ");
    }
  });

  it("дата в прошлом, конец раньше начала, цена «до» меньше «от», ссылка без https", () => {
    const res = validateEventForm(
      { ...valid, date: "2026-11-01", end_time: "10:00", price_max: "100", ticket_url: "http://x.ru" },
      UFA,
      now,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.date).toBe("Дата и время начала уже прошли");
      expect(res.errors.price_max).toBe("Цена «до» не может быть меньше цены «от»");
      expect(res.errors.ticket_url).toBe("Ссылка должна начинаться с https://");
    }
    const end = validateEventForm({ ...valid, end_time: "10:30" }, UFA, now);
    expect(!end.ok && end.errors.end_time).toBe("Окончание должно быть позже начала");
  });

  it("бесплатное событие: цены не отправляются", () => {
    const res = validateEventForm({ ...valid, is_free: true, price_min: "abc" }, UFA, now);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.is_free).toBe(true);
      expect(res.data.price_min).toBeUndefined();
    }
  });

  it("цена с запятой и пробелами", () => {
    const res = validateEventForm({ ...valid, price_min: "1 200,50" }, UFA, now);
    expect(res.ok && res.data.price_min).toBe(1200.5);
  });
});

describe("недоверенный ввод Server Action", () => {
  it("неожиданные типы не роняют проверку, а превращаются в ошибки полей", () => {
    const v = coerceFormValues({
      title: { $gt: "" },
      categories: ["theatre", 1, null],
      is_free: "true",
      date: 20261115,
    });
    expect(v.title).toBe("");
    expect(v.categories).toEqual(["theatre"]);
    expect(v.is_free).toBe(false);
    expect(v.date).toBe("");
    const res = validateEventForm(v, UFA, now);
    expect(res.ok).toBe(false);
    expect(coerceFormValues(null).categories).toEqual([]);
  });
});
