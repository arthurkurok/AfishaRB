/**
 * Импорт событий из CSV/JSON-файла (ТЗ уровень 1+, общие требования раздела 6.1): министерство
 * загружает файл целиком и получает отчёт «добавлено / обновлено / без изменений / отклонено с причинами».
 *
 * Разбор и нормализация — чистые функции (покрыты тестами без БД). Запись идёт через CatalogWriter
 * с тем же механизмом идемпотентности, что и у коннекторов: source_record ищется по externalId
 * (стабильный хеш нормализованной строки), повторная загрузка того же файла ничего не создаёт.
 * Сырая строка файла хранится в source_record.payload отдельно от нормализованных полей события.
 */
import type { CategoryCode, TagCode } from "@afisha/contract";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { municipality, source, sourceRecord } from "../../db/schema.js";
import { classify, TAGS } from "../catalog/index.js";
import { REGION_ID } from "../geo/index.js";
import { refreshDerived } from "../lifecycle/index.js";
import { cleanUrl, makeSummary } from "./normalize-culture-ru.js";
import { CatalogWriter, emptyStats, ensureReference, finishRun, hashOf, startRun } from "./pipeline.js";
import type { NormalizedEvent } from "./types.js";

/** Идентификатор источника для файлового импорта (одна запись в таблице source). */
export const IMPORT_SOURCE_ID = "import";
/** Причина у сеансов, отменённых импортом (отличаем от отменённых людьми — те не воскресаем). */
const CANCELLED_BY_IMPORT = "Отменено в импортируемом файле";
/** Часовой пояс региона: даты без смещения в файле считаются по Уфе (+05:00). */
const REGION_OFFSET = "+05:00";
/** Строки пишутся пачками по 100, каждая — в своей точке сохранения (не «отвалить всю пачку»). */
const CHUNK = 100;

/** Ошибка формата файла: маршрут отвечает 400, CLI — ненулевым кодом выхода. */
export class ImportFormatError extends Error {}

/* ============================================================
 * CSV: RFC 4180 — кавычки, «""», запятые и переводы строк внутри кавычек
 * ============================================================ */

export type CsvRecord = { line: number; cells: string[] };
export type CsvTable = { delimiter: "," | ";"; records: CsvRecord[] };

/** Разделитель (запятая или точка с запятой) определяется по строке заголовков. */
function sniffDelimiter(src: string): "," | ";" {
  let inQuotes = false;
  let commas = 0;
  let semis = 0;
  for (const ch of src) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (inQuotes) continue;
    else if (ch === "\n" || ch === "\r") break;
    else if (ch === ",") commas++;
    else if (ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

/** Разбор CSV по RFC 4180: кавычки, экранирование «""», запятые и переводы строк внутри кавычек. */
export function parseCsv(text: string): CsvTable {
  const src = text.replace(/^\uFEFF/, ""); // BOM из Excel
  const delimiter = sniffDelimiter(src);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1; // физический номер строки; переводы внутри кавычек тоже считаются
  let recordLine = 1;

  const endRecord = () => {
    cells.push(field);
    // полностью пустые строки (перевод строки в конце файла, пробелы между данными) пропускаем
    if (!(cells.length === 1 && cells[0]?.trim() === "")) records.push({ line: recordLine, cells });
    cells = [];
    field = "";
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else {
        if (ch === "\n") line++;
        field += ch;
      }
    } else if (ch === '"') inQuotes = true;
    else if (ch === "\r")
      continue; // CRLF: \r перед \n пропускаем
    else if (ch === delimiter) {
      cells.push(field);
      field = "";
    } else if (ch === "\n") {
      endRecord();
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (field !== "" || cells.length > 0) endRecord();
  return { delimiter, records };
}

/* ============================================================
 * multipart/form-data: поле file (без внешних зависимостей)
 * ============================================================ */

export type MultipartPart = { name: string; filename: string | null; data: Buffer };

/** Разбор multipart/form-data: достаточно поля file с именем файла, остальное не трогаем. */
export function parseMultipart(body: Buffer, contentType: string): Map<string, MultipartPart> {
  const parts = new Map<string, MultipartPart>();
  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary) return parts;
  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  if (pos === -1) return parts;
  pos += delim.length;
  while (pos < body.length) {
    if (body[pos] === 0x2d && body[pos + 1] === 0x2d) break; // закрывающий --boundary--
    if (body[pos] === 0x0d) pos++; // CRLF после разделителя
    if (body[pos] === 0x0a) pos++;
    let headerEnd = body.indexOf("\r\n\r\n", pos);
    let sep = 4;
    if (headerEnd === -1) {
      headerEnd = body.indexOf("\n\n", pos); // редкие клиенты пишут только LF
      sep = 2;
    }
    if (headerEnd === -1) break;
    const headers = body.subarray(pos, headerEnd).toString("utf8");
    // границу следующей части ищем по «\n--boundary»: покрывает и CRLF, и редкий чистый LF
    const tail = Buffer.from(`\n--${boundary}`);
    const next = body.indexOf(tail, headerEnd + sep);
    let dataEnd = next === -1 ? body.length : next;
    if (next !== -1 && body[dataEnd - 1] === 0x0d) dataEnd--; // хвостовой \r из CRLF
    const name = headers.match(/name="([^"]*)"/i)?.[1] ?? "";
    if (name)
      parts.set(name, {
        name,
        filename: headers.match(/filename="([^"]*)"/i)?.[1] ?? null,
        data: body.subarray(headerEnd + sep, dataEnd),
      });
    if (next === -1) break;
    pos = next + tail.length;
  }
  return parts;
}

/* ============================================================
 * Поля файла: даты, цены, категории, статусы
 * ============================================================ */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const RU_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[T ](\d{1,2}):(\d{2}))?$/;

const pad = (s: string) => s.padStart(2, "0");
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Дата из файла: ISO 8601 («2026-11-14T18:00:00+05:00») или «ДД.ММ.ГГГГ ЧЧ:ММ».
 * Без смещения и в русском формате — часовой пояс региона (+05:00), не пояс сервера.
 * Дата без времени: date_start — начало дня (00:00), date_end (endOfDay) — конец дня (23:59:59).
 */
export function parseImportDate(value: string, endOfDay = false): Date | null {
  const v = value.trim();
  if (!v) return null;
  let m = v.match(ISO_RE);
  if (m) {
    const time = m[4] !== undefined ? `${m[4]}:${m[5] ?? "00"}:${m[6] ?? "00"}` : endOfDay ? "23:59:59" : "00:00:00";
    const off = m[7] === undefined ? REGION_OFFSET : m[7] === "Z" ? "Z" : m[7].replace(/([+-]\d{2})(\d{2})/, "$1:$2");
    return checked(`${m[1]}-${m[2]}-${m[3]}T${time}${off}`, Number(m[1]), Number(m[2]), Number(m[3]));
  }
  m = v.match(RU_RE);
  if (m) {
    const time = m[4] !== undefined ? `${pad(m[4]!)}:${m[5]!}:00` : endOfDay ? "23:59:59" : "00:00:00";
    return checked(
      `${m[3]!}-${pad(m[2]!)}-${pad(m[1]!)}T${time}${REGION_OFFSET}`,
      Number(m[3]),
      Number(m[2]),
      Number(m[1]),
    );
  }
  return null;
}

/** Проверка диапазонов: «31 февраля» и «13-й месяц» не проходят молча. */
function checked(iso: string, y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ParsedPrice = { min: number | null; max: number | null; free: boolean };

const FREE_RE = /вход\s+свободн|свободный\s+вход|бесплатн/i;
const N = String.raw`\d+(?:[.,]\d+)?`;

/** Цена из текста: «вход свободный», «от 300 до 800», «от 300», «до 800», «300–500», «300 руб.». */
export function parsePriceField(value: string): ParsedPrice {
  const v = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!v) return { min: null, max: null, free: false };
  if (FREE_RE.test(v)) return { min: null, max: null, free: true };
  const num = (s: string | undefined) => (s === undefined ? null : Number(s.replace(",", ".")));
  const from = v.match(new RegExp(`(?:^|\\s)от\\s*(${N})`));
  if (from) {
    const to = v.match(new RegExp(`(?:^|\\s)до\\s*(${N})`));
    return { min: num(from[1]), max: num(to?.[1]), free: false };
  }
  const to = v.match(new RegExp(`(?:^|\\s)до\\s*(${N})`));
  if (to) return { min: null, max: num(to[1]), free: false };
  const range = v.match(new RegExp(`^(${N})\\s*(?:[-–—]|по)\\s*(${N})`));
  if (range) return { min: num(range[1]), max: num(range[2]), free: false };
  const single = v.match(new RegExp(`(${N})`));
  if (single) {
    const n = num(single[1]);
    return { min: n, max: n, free: false }; // одна цена — фиксированная
  }
  return { min: null, max: null, free: false };
}

/** Русские названия категорий файла → коды таксономии («зонтик курая», docs/03 §1.1). */
const CATEGORY_RU: [RegExp, CategoryCode][] = [
  [/^спектакл/, "theatre"],
  [/^театр/, "theatre"],
  [/^концерт/, "music"],
  [/^музык/, "music"],
  [/^выставк/, "museum"],
  [/^музе/, "museum"],
  [/^галере/, "museum"],
  [/^экскурси/, "museum"],
  [/^фестивал/, "folk"],
  [/^праздник/, "folk"],
  [/^народн/, "folk"],
  [/^сабантуй/, "folk"],
  [/^йыйын/, "folk"],
  [/^кино/, "cinema"],
  [/^фильм/, "cinema"],
  [/^мульт/, "cinema"],
  [/^детск/, "kids"],
  [/^для детей/, "kids"],
  [/^сказк/, "kids"],
  [/^лекци/, "education"],
  [/^мастер-?класс/, "education"],
  [/^встреч/, "education"],
  [/^бесед/, "education"],
  [/^квиз/, "education"],
  [/^образован/, "education"],
];
const OTHER_CATEGORY = /^(друг|про?чее|other)/;

function parseCategory(raw: string): { code: CategoryCode | null; error: string | null } {
  const v = raw.trim().toLowerCase().replace("ё", "е");
  if (!v) return { code: null, error: null };
  if (OTHER_CATEGORY.test(v)) return { code: null, error: null }; // «другое» — определяем по тексту
  const code = CategoryCodeByEn(v);
  if (code) return { code, error: null };
  for (const [re, c] of CATEGORY_RU) if (re.test(v)) return { code: c, error: null };
  return { code: null, error: `неизвестная категория «${raw.trim()}»` };
}

function CategoryCodeByEn(v: string): CategoryCode | null {
  const codes: CategoryCode[] = ["theatre", "music", "museum", "kids", "folk", "cinema", "education"];
  return codes.includes(v as CategoryCode) ? (v as CategoryCode) : null;
}

/** Русские подписи тегов → коды (те же формулировки, что в таксономии); прочее сохраняем в жанрах источника. */
const TAG_BY_LABEL: Record<string, TagCode> = Object.fromEntries(
  Object.entries(TAGS).map(([code, v]) => [v.ru.toLowerCase().replace("ё", "е"), code as TagCode]),
);
const TAG_CODES: TagCode[] = Object.keys(TAGS) as TagCode[];

function parseTag(raw: string): TagCode | null {
  const v = raw.trim().toLowerCase().replace("ё", "е");
  return TAG_BY_LABEL[v] ?? (TAG_CODES.includes(v as TagCode) ? (v as TagCode) : null);
}

type RowStatus = "publish" | "draft" | "cancel";

function parseStatus(raw: string): { status: RowStatus; error: string | null } {
  const v = raw.trim().toLowerCase().replace("ё", "е");
  if (!v || /^опубликован|^публикац|^published/.test(v)) return { status: "publish", error: null };
  if (/^черновик|^draft/.test(v)) return { status: "draft", error: null };
  if (/^отмен|^cancel/.test(v)) return { status: "cancel", error: null };
  return { status: "publish", error: `неизвестный статус «${raw.trim()}»` };
}

const TRUE_WORDS = new Set(["да", "true", "1", "yes", "y", "бесплатно"]);
const FALSE_WORDS = new Set(["нет", "false", "0", "no", "n", "платно"]);

/** Координата: число (запятая — тоже десятичный разделитель), вне диапазона — «не указано». */
function parseCoord(v: string, limit: number): number | null {
  if (!v) return null;
  const n = Number(v.replace(",", ".").trim());
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function normalizeCity(raw: string): string {
  return collapse(raw.replace(/^\s*г\s*[.\s]\s*/i, ""));
}

/** Транслитерация в slug — для муниципалитетов, которых ещё нет в каталоге (совпадает с slug'ами Культура.РФ). */
const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
function slugifyRu(name: string): string {
  const slug = name
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "municipality";
}

/* ============================================================
 * Нормализация строки файла → NormalizedEvent
 * ============================================================ */

export type RawRecord = { line: number; fields: Record<string, unknown> };
export type RejectedRow = { row: number; reason: string };

export type NormalizedRow = {
  line: number;
  /** Стабильный ключ строки: хеш нормализованного JSON (без статуса — статус это команда, не идентичность). */
  externalId: string;
  /** Сырые поля строки — в source_record.payload, отдельно от нормализованных. */
  raw: Record<string, unknown>;
  ne: NormalizedEvent;
  status: RowStatus;
};

const AGE_VALUES = [0, 6, 12, 16, 18];

/**
 * Одна строка файла → нормализованное событие или причина отклонения.
 * Обязательные поля (title, date_start, city, venue, age_limit) проверяются по 436-ФЗ
 * и аналогично кабинету учреждения: строка без возрастного знака отклоняется с причиной.
 */
export function normalizeRow(
  rec: RawRecord,
  muniOf: (city: string) => { id: string; title: string },
): NormalizedRow | RejectedRow {
  const errors: string[] = [];
  const f = (name: string): string => {
    const v = rec.fields[name];
    return v === null || v === undefined ? "" : String(v).trim();
  };

  const title = collapse(f("title"));
  if (!title) errors.push("не указано название (title)");
  else if (title.length > 200) errors.push("название длиннее 200 символов");

  const city = normalizeCity(f("city"));
  if (!city) errors.push("не указан город (city)");
  const venue = collapse(f("venue"));
  if (!venue) errors.push("не указана площадка (venue)");
  const address = collapse(f("address")) || null;

  const startRaw = f("date_start");
  let start: Date | null = null;
  if (!startRaw) errors.push("не указана дата начала (date_start)");
  else {
    start = parseImportDate(startRaw);
    if (!start) errors.push(`не удалось разобрать дату начала «${startRaw}» — ожидается ISO 8601 или ДД.ММ.ГГГГ ЧЧ:ММ`);
  }
  const endRaw = f("date_end");
  let end: Date | null = null;
  if (endRaw) {
    end = parseImportDate(endRaw, true);
    if (!end) errors.push(`не удалось разобрать дату окончания «${endRaw}»`);
    else if (start && end.getTime() < start.getTime()) errors.push("дата окончания раньше даты начала");
  }

  const durationRaw = f("duration_min").replace(",", ".");
  const duration = durationRaw && Number.isFinite(Number(durationRaw)) ? Math.round(Number(durationRaw)) : null;

  const ageRaw = f("age_limit").replace("+", "").trim();
  let age: number | null = null;
  if (!ageRaw) errors.push("не указан возрастной знак (age_limit) — обязателен по 436-ФЗ");
  else if (!AGE_VALUES.includes(Number(ageRaw))) {
    errors.push(`недопустимый возрастной знак «${f("age_limit")}» — допустимы 0, 6, 12, 16, 18`);
  } else age = Number(ageRaw);

  const cat = parseCategory(f("category"));
  if (cat.error)
    errors.push(
      `${cat.error} (допустимы: концерт, спектакль, выставка, фестиваль, кино, экскурсия, другое или коды theatre/music/museum/kids/folk/cinema/education)`,
    );

  const st = parseStatus(f("status"));
  if (st.error) errors.push(`${st.error} (допустимы: опубликовано, черновик, cancelled)`);

  const langRaw = f("language").toLowerCase();
  const lang = langRaw.startsWith("баш") || langRaw === "ba" ? "ba" : "ru";

  const freeWord = f("is_free").toLowerCase();
  const isFreeFlag = TRUE_WORDS.has(freeWord) ? true : FALSE_WORDS.has(freeWord) ? false : null;

  const pmin = parsePriceField(f("price_min"));
  const pmax = parsePriceField(f("price_max"));
  let priceMin = pmin.min;
  let priceMax = pmax.max ?? pmin.max;
  const isFree = pmin.free || pmax.free || isFreeFlag === true || (priceMin === 0 && priceMax === 0);
  if (isFree) {
    priceMin = null;
    priceMax = null;
  }

  const description = f("description");
  const sourceUrl = cleanUrl(f("source_url"));

  if (errors.length > 0) return { row: rec.line, reason: errors.join("; ") };

  // Категория не указана или «другое» — определяем по тексту (та же classify, что у коннекторов)
  const tagList = f("tags")
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean);
  const auto = classify(
    [],
    tagList.map((t) => t.toLowerCase()),
    title,
    description,
    age,
  );
  const categories: CategoryCode[] = cat.code ? [cat.code] : auto.categories;

  const tags = new Set<TagCode>(auto.tags);
  const sourceGenres: string[] = [];
  for (const t of tagList) {
    const code = parseTag(t);
    if (code) tags.add(code);
    else sourceGenres.push(t);
  }
  if (isFree) tags.add("free");
  if (lang === "ba") tags.add("on_bashkir");

  const money = (n: number | null) => (n === null ? null : n.toFixed(2));
  const priceMinStr = isFree ? "0.00" : money(priceMin);
  const priceMaxStr = isFree ? "0.00" : money(priceMax);

  const lat = parseCoord(f("lat"), 90);
  const lon = parseCoord(f("lon"), 180);

  const muni = muniOf(city);
  // Ключ площадки стабилен: город + название + адрес. Хранится в culture_place_id —
  // единственный ключ, который CatalogWriter подхватывает при повторном прогоне (warm).
  const venueExternalId = `import:${hashOf({ city, venue, address })}`;
  const startsAt = start!;
  const endsAt = end ?? (duration !== null && duration > 0 ? new Date(startsAt.getTime() + duration * 60_000) : null);

  const ne: NormalizedEvent = {
    sourceId: IMPORT_SOURCE_ID,
    externalId: "",
    title,
    summary: description ? makeSummary(description) : "",
    descriptionHtml: description
      ? description
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(collapse(p))}</p>`)
          .join("")
      : "",
    categories,
    tags: [...tags].sort(),
    sourceGenres: [...new Set(sourceGenres)].sort(),
    ageRating: age,
    priceMin: priceMinStr,
    priceMax: priceMaxStr,
    isFree,
    pushkinCard: tags.has("pushkin"),
    accessible: tags.has("accessible"),
    isPermanent: false,
    ticketUrl: null,
    images: [],
    organization: null, // org_link — ссылка на организацию: сохраняем в сырых данных, учреждение не выдумываем
    venues: [
      {
        externalId: venueExternalId,
        name: venue,
        address,
        lat,
        lon,
        municipalityId: muni.id,
        municipalityTitle: muni.title,
        cultureLocaleId: null,
        externalIds: { culture_place_id: venueExternalId },
      },
    ],
    sessions: [
      {
        externalId: "s1",
        venueExternalId,
        startsAt,
        endsAt,
        isRange: end !== null && end.getTime() - startsAt.getTime() > 20 * 3600_000,
        ticketUrl: null,
      },
    ],
    sourceUrl,
    sourceUpdatedAt: null,
    languages: [lang],
  };

  // Стабильный ключ строки — натуральный: «что + где + когда» (название, город, площадка, дата начала).
  // Правка цены, описания, тегов и статуса не создаёт дубликат, а обновляет событие — «обновлено» в отчёте.
  const externalId = hashOf({ title, city, venue, startsAt: startsAt.toISOString() });
  ne.externalId = externalId;

  return { line: rec.line, externalId, raw: rec.fields, ne, status: st.status };
}

/* ============================================================
 * Файл → строки (CSV с заголовками или JSON)
 * ============================================================ */

const COLUMN_FIELDS = [
  "title",
  "category",
  "tags",
  "date_start",
  "date_end",
  "duration_min",
  "city",
  "venue",
  "address",
  "lat",
  "lon",
  "description",
  "price_min",
  "price_max",
  "is_free",
  "age_limit",
  "language",
  "org_link",
  "source_url",
  "status",
];

export type ParsedFile = { format: "csv" | "json"; records: RawRecord[] };

/** Текст файла → строки: JSON (массив или {events}) определяется по первому символу, иначе CSV. */
export function parseFile(content: string, filename?: string | null): ParsedFile {
  const hint = filename?.toLowerCase() ?? "";
  const trimmed = content.replace(/^\uFEFF/, "").trimStart();
  const looksJson = trimmed.startsWith("[") || trimmed.startsWith("{");
  if (hint.endsWith(".csv")) return fromCsvText(content);
  if (hint.endsWith(".json")) return fromJsonText(content);
  return looksJson ? fromJsonText(content) : fromCsvText(content);
}

function fromCsvText(text: string): ParsedFile {
  const table = parseCsv(text);
  if (table.records.length === 0) throw new ImportFormatError("файл пуст — нет строки заголовков");
  const headers = table.records[0]!.cells.map((h) => h.trim().toLowerCase());
  const missing = ["title", "date_start", "city", "venue", "age_limit"].filter((c) => !headers.includes(c));
  if (missing.length > 0) throw new ImportFormatError(`в CSV нет обязательных колонок: ${missing.join(", ")}`);
  const records: RawRecord[] = [];
  for (let i = 1; i < table.records.length; i++) {
    const rec = table.records[i]!;
    const fields: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (COLUMN_FIELDS.includes(h)) fields[h] = rec.cells[idx] ?? "";
    });
    records.push({ line: rec.line, fields });
  }
  return { format: "csv", records };
}

function fromJsonText(text: string): ParsedFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new ImportFormatError(`не удалось разобрать JSON: ${(err as Error).message.slice(0, 200)}`);
  }
  return fromJsonValue(parsed);
}

function fromJsonValue(value: unknown): ParsedFile {
  let events: unknown[] | null = null;
  if (Array.isArray(value)) events = value;
  else if (value !== null && typeof value === "object" && Array.isArray((value as { events?: unknown }).events))
    events = (value as { events: unknown[] }).events;
  if (!events) throw new ImportFormatError('JSON-файл должен быть массивом объектов или {"events": [...]}');
  const records: RawRecord[] = [];
  events.forEach((item, idx) => {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      throw new ImportFormatError(`элемент ${idx + 1} не является объектом`);
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      const key = k.trim().toLowerCase();
      if (COLUMN_FIELDS.includes(key)) fields[key] = v;
    }
    records.push({ line: idx + 1, fields });
  });
  return { format: "json", records };
}

/* ============================================================
 * Импорт: запись через CatalogWriter + отчёт
 * ============================================================ */

export type ImportReport = {
  filename: string | null;
  format: "csv" | "json";
  dry_run: boolean;
  total: number;
  added: number;
  updated: number;
  unchanged: number;
  rejected: RejectedRow[];
};

export type ImportInput = {
  /** Текст файла (CSV или JSON) или уже разобранный массив событий. */
  content: string | unknown[];
  filename?: string | null;
  dryRun?: boolean;
};

/** Тело POST /admin/import в JSON-варианте (multipart разбирается отдельно). Схема локальная: маршрут скрыт из OpenAPI. */
export const ImportBody = z.object({
  content: z.union([z.string().min(1).max(10_000_000), z.array(z.record(z.string(), z.unknown()))]),
  filename: z.string().max(255).nullable().optional(),
  dry_run: z.boolean().optional(),
});

type Exec = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

/** Запись источника «import»: ручные загрузки министерства, уровень доверия official. */
async function ensureImportSource(db: Db): Promise<void> {
  await db
    .insert(source)
    .values({
      id: IMPORT_SOURCE_ID,
      regionId: REGION_ID,
      title: "Файловый импорт министерства",
      kind: "cabinet",
      trustLevel: "official",
      url: null,
    })
    .onConflictDoNothing();
}

/** Черновик не публикуется; «отменено» — у сеансов. Идемпотентно: повторный импорт ничего не меняет. */
async function applyRowStatus(db: Exec, row: NormalizedRow, eventId: string): Promise<void> {
  if (row.status === "draft") {
    await db.execute(
      sql`UPDATE event SET moderation_status = 'pending' WHERE id = ${eventId} AND moderation_status <> 'pending'`,
    );
    return;
  }
  const prefix = `${IMPORT_SOURCE_ID}:${row.externalId}:%`;
  if (row.status === "cancel") {
    await db.execute(sql`
      UPDATE occurrence SET status = 'cancelled', status_reason = ${CANCELLED_BY_IMPORT}, updated_at = now()
      WHERE source_key LIKE ${prefix} AND status <> 'cancelled'`);
    return;
  }
  // «опубликовано»: возвращаем сеансы, отменённые прежним импортом (отменённые людьми не трогаем)
  await db.execute(sql`
    UPDATE occurrence SET status = 'scheduled', status_reason = NULL, updated_at = now()
    WHERE source_key LIKE ${prefix} AND status = 'cancelled' AND status_reason = ${CANCELLED_BY_IMPORT}`);
}

/** Производные поля (поиск, качество) после импорта — мягко: сбой обновления не валит отчёт. */
async function refreshDerivedSafe(db: Db): Promise<void> {
  try {
    await refreshDerived(db);
  } catch {
    /* поисковые поля обновит следующий регламентный прогон */
  }
}

/**
 * Импорт файла: разбор → нормализация → идемпотентная запись через CatalogWriter.
 * dryRun — только проверка: строки классифицируются по существующим source_record, ничего не пишется.
 */
export async function importFile(db: Db, input: ImportInput): Promise<ImportReport> {
  const dryRun = input.dryRun === true;
  const parsed = Array.isArray(input.content)
    ? fromJsonValue(input.content)
    : typeof input.content === "string"
      ? parseFile(input.content, input.filename ?? undefined)
      : fromJsonValue(input.content);

  const report: ImportReport = {
    filename: input.filename ?? null,
    format: parsed.format,
    dry_run: dryRun,
    total: parsed.records.length,
    added: 0,
    updated: 0,
    unchanged: 0,
    rejected: [],
  };
  if (parsed.records.length === 0) return report;

  // Муниципалитет: сначала точное имя из каталога (совпадает с данными Культура.РФ), потом транслит-слаг
  const muniByName = new Map<string, { id: string; title: string }>();
  for (const r of await db.select({ id: municipality.id, ru: sql<string>`name->>'ru'` }).from(municipality))
    muniByName.set(r.ru.trim().toLowerCase(), { id: r.id, title: r.ru.trim() });
  const muniOf = (city: string): { id: string; title: string } =>
    muniByName.get(city.toLowerCase()) ?? { id: slugifyRu(city), title: city };

  const normalized: NormalizedRow[] = [];
  for (const rec of parsed.records) {
    const res = normalizeRow(rec, muniOf);
    if ("reason" in res) report.rejected.push(res);
    else normalized.push(res);
  }

  if (dryRun) {
    // Классификация без записи: тот же payload_hash → «без изменений», другой → «обновлено»
    const known = new Map<string, string>();
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const ids = normalized.slice(i, i + CHUNK).map((r) => r.externalId);
      const rows = await db
        .select({ externalId: sourceRecord.externalId, payloadHash: sourceRecord.payloadHash })
        .from(sourceRecord)
        .where(and(eq(sourceRecord.sourceId, IMPORT_SOURCE_ID), inArray(sourceRecord.externalId, ids)));
      for (const r of rows) known.set(r.externalId, r.payloadHash);
    }
    for (const row of normalized) {
      const hash = known.get(row.externalId);
      if (hash === undefined) report.added++;
      else if (hash === hashOf(row.raw)) report.unchanged++;
      else report.updated++;
    }
    return report;
  }

  await ensureReference(db);
  await ensureImportSource(db);
  const runId = await startRun(db, IMPORT_SOURCE_ID);
  const total = emptyStats();
  let failed = false;
  try {
    for (let i = 0; i < normalized.length; i += CHUNK) {
      const chunk = normalized.slice(i, i + CHUNK);
      await db.transaction(async (tx) => {
        let writer = new CatalogWriter(tx, IMPORT_SOURCE_ID, runId);
        await writer.warm();
        for (const row of chunk) {
          await tx.execute(sql`SAVEPOINT import_row`);
          const logMark = writer.pendingLogs();
          try {
            const eventId = await writer.upsert(row.ne, row.raw);
            await applyRowStatus(tx, row, eventId);
            await tx.execute(sql`RELEASE SAVEPOINT import_row`);
          } catch (err) {
            // одна битая строка не откатывает пачку (MJ-2); запись — как причина отклонения
            await tx.execute(sql`ROLLBACK TO SAVEPOINT import_row`);
            const msg = String(err)
              .replace(/^Error:\s*/, "")
              .slice(0, 200);
            report.rejected.push({ row: row.line, reason: `ошибка записи: ${msg}` });
            total.errors.push(`строка ${row.line}: ${msg}`);
            // кэши писателя могли запомнить откатанные строки — пересоздаём (как в runner)
            const keepLogs = writer.takeLogs(logMark);
            const stats = writer.stats;
            writer = new CatalogWriter(tx, IMPORT_SOURCE_ID, runId);
            Object.assign(writer.stats, stats);
            writer.restoreLogs(keepLogs);
            await writer.warm();
          }
        }
        await writer.flushLogs();
        const acc = total as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(writer.stats)) if (typeof v === "number") acc[k] = (acc[k] ?? 0) + v;
      });
    }
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    // Файловый импорт — не полный срез источника: детектор исчезновений не запускаем (complete=false)
    await finishRun(db, IMPORT_SOURCE_ID, runId, total, false, failed);
    if (!failed) await refreshDerivedSafe(db);
  }
  report.added = total.eventsNew;
  report.updated = total.eventsUpdated;
  report.unchanged = total.eventsUnchanged;
  return report;
}
