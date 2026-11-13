/**
 * Форма «Новое событие»: черновик ИИ-помощника → поля формы → тело POST /admin/events.
 * Проверка — той же zod-схемой `CabinetEventCreate`, что и на сервере API (contract-first),
 * плюс правила формы, которых нет в схеме (дата в будущем, конец позже начала, цена «до» не меньше «от»).
 * Используется и в браузере (подсказки до отправки), и в Server Action (окончательная проверка).
 */
import { CabinetEventCreate, CategoryCode } from "@afisha/contract";
import type { EventDraft } from "./admin-types";
import { isValidDate, isValidTime, zonedToIso } from "./datetime";

export const AGE_RATINGS = [0, 6, 12, 16, 18] as const;

export interface EventFormValues {
  organization_id: string;
  venue_id: string;
  title: string;
  summary: string;
  categories: string[];
  /** "" — не выбран (обязателен по 436-ФЗ) */
  age_rating: string;
  date: string;
  time: string;
  end_time: string;
  is_free: boolean;
  price_min: string;
  price_max: string;
  ticket_url: string;
  pushkin_card: boolean;
}

export type FieldName = keyof EventFormValues;
export type FieldErrors = Partial<Record<FieldName, string>>;

export function emptyValues(organizationId: string): EventFormValues {
  return {
    organization_id: organizationId,
    venue_id: "",
    title: "",
    summary: "",
    categories: [],
    age_rating: "",
    date: "",
    time: "",
    end_time: "",
    is_free: false,
    price_min: "",
    price_max: "",
    ticket_url: "",
    pushkin_card: false,
  };
}

/** Поля формы из черновика. Только то, что помощник действительно нашёл; остальное сотрудник заполнит сам. */
export function draftToValues(draft: EventDraft, organizationId: string, venueId = ""): EventFormValues {
  const age = draft.age_rating !== null && (AGE_RATINGS as readonly number[]).includes(draft.age_rating);
  return {
    ...emptyValues(organizationId),
    venue_id: venueId,
    title: draft.title.slice(0, 200),
    summary: draft.summary.slice(0, 600),
    categories: draft.categories.filter((c) => CategoryCode.safeParse(c).success),
    age_rating: age ? String(draft.age_rating) : "",
    date: draft.date_from ?? "",
    time: draft.time ?? "",
    is_free: draft.is_free,
    price_min: draft.price_min !== null && !draft.is_free ? String(draft.price_min) : "",
  };
}

export type Confidence = "high" | "check" | "missing";

/** Уверенность помощника по полю формы: подсветка «найдено в тексте» / «проверьте» / «не найдено». */
export function fieldConfidence(
  draft: EventDraft | null,
  field: FieldName,
  values: EventFormValues,
): Confidence | null {
  if (!draft) return null;
  const key: Partial<Record<FieldName, string>> = {
    title: "title",
    categories: "categories",
    date: "date",
    time: "time",
    age_rating: "age",
  };
  const k = key[field];
  if (!k) return null;
  const c = draft.confidence[k] ?? 0;
  const filled = field === "categories" ? values.categories.length > 0 : String(values[field]).trim() !== "";
  if (c <= 0 || !filled) return "missing";
  return c >= 0.85 ? "high" : "check";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Найдено в тексте",
  check: "Проверьте",
  missing: "Не найдено — заполните",
};

/** Предупреждения помощника, которые уже неактуальны (возраст найден, а предупреждение о нём пришло). */
export function relevantWarnings(draft: EventDraft): string[] {
  return draft.warnings.filter((w) => !(draft.age_rating !== null && /возрастн/i.test(w)));
}

const MESSAGES: Partial<Record<FieldName, string>> = {
  organization_id: "Выберите учреждение",
  venue_id: "Выберите площадку",
  title: "Название — от 3 до 200 символов",
  summary: "Описание — не длиннее 600 символов",
  categories: "Отметьте хотя бы одну категорию",
  age_rating: "Выберите возрастной знак — без него событие не публикуется (436-ФЗ)",
  price_min: "Цена — неотрицательное число",
  price_max: "Цена — неотрицательное число",
  ticket_url: "Ссылка должна начинаться с https://",
};

const PATH_TO_FIELD: Record<string, FieldName> = {
  organization_id: "organization_id",
  venue_id: "venue_id",
  title: "title",
  summary: "summary",
  categories: "categories",
  age_rating: "age_rating",
  starts_at: "date",
  ends_at: "end_time",
  price_min: "price_min",
  price_max: "price_max",
  ticket_url: "ticket_url",
  is_free: "is_free",
  pushkin_card: "pushkin_card",
};

function parseMoney(s: string): number | undefined | "invalid" {
  const v = s.trim().replace(/\s/g, "").replace(",", ".");
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : "invalid";
}

export type ValidationResult = { ok: true; data: CabinetEventCreate } | { ok: false; errors: FieldErrors };

export function validateEventForm(values: EventFormValues, tz: string, now: Date = new Date()): ValidationResult {
  const errors: FieldErrors = {};

  let startsAt: string | undefined;
  if (!isValidDate(values.date)) errors.date = "Укажите дату начала";
  if (!isValidTime(values.time)) errors.time = "Укажите время начала в формате ЧЧ:ММ";
  if (!errors.date && !errors.time) {
    startsAt = zonedToIso(values.date, values.time, tz);
    if (new Date(startsAt).getTime() <= now.getTime()) errors.date = "Дата и время начала уже прошли";
  }

  let endsAt: string | undefined;
  if (values.end_time.trim()) {
    if (!isValidTime(values.end_time)) errors.end_time = "Время окончания — в формате ЧЧ:ММ";
    else if (startsAt) {
      endsAt = zonedToIso(values.date, values.end_time, tz);
      if (new Date(endsAt).getTime() <= new Date(startsAt).getTime())
        errors.end_time = "Окончание должно быть позже начала";
    }
  }

  const priceMin = values.is_free ? undefined : parseMoney(values.price_min);
  const priceMax = values.is_free ? undefined : parseMoney(values.price_max);
  if (priceMin === "invalid") errors.price_min = MESSAGES.price_min;
  if (priceMax === "invalid") errors.price_max = MESSAGES.price_max;
  if (typeof priceMin === "number" && typeof priceMax === "number" && priceMax < priceMin)
    errors.price_max = "Цена «до» не может быть меньше цены «от»";

  const ticket = values.ticket_url.trim();
  if (ticket && !/^https:\/\//i.test(ticket)) errors.ticket_url = MESSAGES.ticket_url;

  const candidate = {
    organization_id: values.organization_id,
    venue_id: values.venue_id,
    title: values.title.trim(),
    summary: values.summary.trim(),
    categories: values.categories,
    age_rating: values.age_rating === "" ? undefined : Number(values.age_rating),
    starts_at: startsAt,
    ends_at: endsAt,
    is_free: values.is_free,
    price_min: typeof priceMin === "number" ? priceMin : undefined,
    price_max: typeof priceMax === "number" ? priceMax : undefined,
    ticket_url: ticket || undefined,
    pushkin_card: values.pushkin_card,
  };

  const parsed = CabinetEventCreate.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = PATH_TO_FIELD[String(issue.path[0] ?? "")];
      if (field && !errors[field]) errors[field] = MESSAGES[field] ?? "Проверьте значение";
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

/** Порядок полей для фокуса на первой ошибке. */
export const FIELD_ORDER: FieldName[] = [
  "title",
  "categories",
  "age_rating",
  "date",
  "time",
  "end_time",
  "venue_id",
  "summary",
  "price_min",
  "price_max",
  "ticket_url",
];

/**
 * Значения формы из недоверенного ввода (Server Action можно вызвать в обход интерфейса):
 * всё приводится к ожидаемым типам, лишнее отбрасывается, длины ограничиваются.
 */
export function coerceFormValues(raw: unknown): EventFormValues {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof r[k] === "string" ? (r[k] as string).slice(0, max) : "");
  const b = (k: string) => r[k] === true;
  return {
    organization_id: s("organization_id", 64),
    venue_id: s("venue_id", 64),
    title: s("title", 400),
    summary: s("summary", 1200),
    categories: Array.isArray(r.categories)
      ? r.categories.filter((c): c is string => typeof c === "string").slice(0, 7)
      : [],
    age_rating: s("age_rating", 2),
    date: s("date", 10),
    time: s("time", 5),
    end_time: s("end_time", 5),
    is_free: b("is_free"),
    price_min: s("price_min", 20),
    price_max: s("price_max", 20),
    ticket_url: s("ticket_url", 2000),
    pushkin_card: b("pushkin_card"),
  };
}
