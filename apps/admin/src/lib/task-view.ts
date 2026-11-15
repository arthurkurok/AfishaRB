/**
 * Человекочитаемое представление задач модерации (03-functional-spec §8): название, дата сеанса в поясе региона,
 * источник по-русски, замечания к данным. Сырой payload модератору не показывается ни для одного вида задач.
 * Чистые функции — покрыты тестами.
 */
import { pgTimestampToIso } from "./admin-types";
import { formatSession } from "./datetime";

type TaskLike = {
  kind: string;
  title_a: string | null;
  title_b?: string | null;
  payload: Record<string, unknown> | null;
  /** Поля API от 15.11 — в прежней версии их нет */
  event_id?: string | null;
  group_size?: number;
  occurrence?: {
    event_id: string | null;
    starts_at: string | null;
    venue: { name: string | null } | null;
    municipality: string | null;
  } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Название события задачи: из каталога (title_a), а если карточки нет — из payload.title. */
export function taskTitle(task: TaskLike): string | null {
  return str(task.title_a) ?? str(task.payload?.title);
}

/** Источники каталога (apps/api ingestion SOURCES) — короткие подписи для модератора. */
const SOURCE: Record<string, string> = {
  culture_ru: "Культура.РФ",
  bashopera: "Сайт Башкирского театра оперы и балета",
  organizer_cabinet: "Кабинет учреждения",
  moderator: "Модератор министерства",
  import: "Файловый импорт министерства",
};

export function sourceLabel(id: string): string {
  return SOURCE[id] ?? id;
}

/** Момент времени из payload: ISO 8601 или текст PostgreSQL «2026-11-14 09:00:00+00». */
function instant(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? pgTimestampToIso(s) : s;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

export interface VanishedView {
  title: string | null;
  /** «вторник, 17 ноября, 14:00» в поясе региона */
  when: string | null;
  /** Сеанс уже прошёл — подтверждать или отменять нечего */
  past: boolean;
  source: string | null;
  /** «Театр кукол, Уфа» */
  place: string | null;
  /** Событие сеанса — для ссылки на карточку на сайте */
  eventId: string | null;
  /** Сколько открытых задач «исчезнувший сеанс» у этого события (1 — только эта) */
  groupSize: number;
}

/** Задача «исчезнувший сеанс»: сеанс пропал из источника при полном прогоне загрузки. */
export function vanishedView(task: TaskLike, tz: string, now: Date = new Date()): VanishedView {
  // Время и площадка — из сеанса в каталоге (API от 15.11), иначе — из снимка в payload
  const startsAt = instant(task.occurrence?.starts_at) ?? instant(task.payload?.starts_at);
  const source = str(task.payload?.source);
  const venue = str(task.occurrence?.venue?.name);
  const city = str(task.occurrence?.municipality);
  const place = [venue, city && !venue?.includes(city) ? city : null].filter(Boolean).join(", ");
  return {
    title: taskTitle(task),
    when: startsAt ? formatSession(startsAt, tz, now) : null,
    past: startsAt ? new Date(startsAt).getTime() < now.getTime() : false,
    source: source ? sourceLabel(source) : null,
    place: place || null,
    eventId: str(task.event_id) ?? str(task.occurrence?.event_id),
    groupSize: Math.max(1, task.group_size ?? 1),
  };
}

const PROBLEM_FIELD: Record<string, string> = {
  age: "Возрастной знак",
  venue: "Площадка",
  sessions: "Сеансы",
  date: "Дата",
  price: "Цена",
  title: "Название",
};

/** Замечания конвейера к записи источника: «age: нет возрастного знака…» → { field: «Возрастной знак», text }. */
export function validationProblems(payload: Record<string, unknown> | null): { field: string | null; text: string }[] {
  const list = payload?.problems;
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is string => typeof p === "string" && p.trim() !== "")
    .map((p) => {
      const m = /^([a-z_]+):\s*(.+)$/s.exec(p.trim());
      if (m?.[1] && m[2]) return { field: PROBLEM_FIELD[m[1]] ?? null, text: m[2] };
      return { field: null, text: p.trim() };
    });
}

/** Подписи известных полей payload. Служебные поля (actions, title, problems) показываются отдельно или скрыты. */
const FACT_LABEL: Record<string, string> = {
  source: "Источник",
  message: "Сообщение",
  error: "Ошибка",
  reason: "Причина",
  run_id: "Прогон загрузки",
  external_id: "Номер в источнике",
  starts_at: "Начало",
  score: "Сходство",
  reasons: "Признаки сходства",
  titles: "Названия",
  count: "Количество",
};
const HIDDEN = new Set(["actions", "title", "problems"]);
/** Порядок вывода: сначала смысловые поля, затем служебные; незнакомые — в конце. JSONB не хранит порядок ключей. */
const ORDER = [
  "source",
  "starts_at",
  "message",
  "error",
  "reason",
  "titles",
  "score",
  "reasons",
  "count",
  "external_id",
  "run_id",
];
const rank = (key: string) => {
  const i = ORDER.indexOf(key);
  return i === -1 ? ORDER.length : i;
};

/**
 * Поля payload для карточки задачи незнакомого вида — подписанным списком, а не JSON.
 * Вложенные объекты пропускаются; списки строк выводятся через запятую.
 */
export function payloadFacts(
  payload: Record<string, unknown> | null,
  tz: string,
  now: Date = new Date(),
): { label: string; value: string }[] {
  if (!payload) return [];
  const out: { label: string; value: string }[] = [];
  const entries = Object.entries(payload).sort(([a], [b]) => rank(a) - rank(b));
  for (const [key, raw] of entries) {
    if (HIDDEN.has(key)) continue;
    let value: string | null = null;
    if (key === "source" && typeof raw === "string") value = sourceLabel(raw);
    else if (key.endsWith("_at")) {
      const at = instant(raw);
      value = at ? formatSession(at, tz, now) : null;
    } else if (typeof raw === "string") value = raw.trim() || null;
    else if (typeof raw === "number") value = raw.toLocaleString("ru-RU");
    else if (typeof raw === "boolean") value = raw ? "да" : "нет";
    else if (Array.isArray(raw) && raw.every((x) => typeof x === "string" || typeof x === "number"))
      value = raw.join(", ") || null;
    if (value) out.push({ label: FACT_LABEL[key] ?? key, value });
  }
  return out;
}
