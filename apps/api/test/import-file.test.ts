/**
 * Импорт событий из CSV/JSON-файла (ТЗ 6.1): разбор, нормализация дат и цен,
 * отчёт «добавлено/обновлено/без изменений/отклонено», идемпотентная запись и маршрут.
 */

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/client.js";
import { closeDb } from "../src/db/client.js";
import { config } from "../src/lib/config.js";
import { buildApp } from "../src/main/app.js";
import {
  ImportFormatError,
  importFile,
  normalizeRow,
  parseCsv,
  parseFile,
  parseImportDate,
  parseMultipart,
  parsePriceField,
} from "../src/modules/ingestion/file-import.js";
import { resetAuthCache } from "../src/modules/organizer/auth.js";
import { resetDb } from "./helpers/db.js";

/* ---------- Helpers ---------- */

const HEADERS =
  "title,category,tags,date_start,date_end,duration_min,city,venue,address,lat,lon,description,price_min,price_max,is_free,age_limit,language,org_link,source_url,status";

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
const toCsv = (rows: Array<Record<string, string>>) =>
  [
    HEADERS,
    ...rows.map((r) =>
      HEADERS.split(",")
        .map((h) => q(r[h] ?? ""))
        .join(","),
    ),
  ].join("\r\n");

const row = (o: Partial<Record<string, string>>) => o as Record<string, string>;

/** Три строки: платный концерт, бесплатная выставка и строка без возрастного знака (436-ФЗ). */
const sampleRows = [
  row({
    title: "Концерт «Курай весны»",
    category: "концерт",
    tags: "музыка;курай",
    date_start: "14.03.2027 18:00",
    date_end: "14.03.2027 20:00",
    city: "г. Уфа",
    venue: "Концертный зал «Башкортостан»",
    address: "ул. Заки Валиди, 14",
    description: "Вечер башкирской музыки",
    price_min: "от 300 до 800",
    age_limit: "6",
    language: "ru",
    status: "опубликовано",
  }),
  row({
    title: "Выставка «Краски Севера»",
    category: "выставка",
    date_start: "2027-04-10",
    date_end: "2027-04-30",
    city: "Уфа",
    venue: "Художественный музей им. Нестерова",
    description: "Работы художников Башкирии",
    price_min: "вход свободный",
    age_limit: "0",
    status: "опубликовано",
  }),
  row({
    title: "Квиз без возрастного знака",
    category: "квиз",
    date_start: "15.03.2027 19:00",
    city: "Уфа",
    venue: "Антикафе «Точка»",
    age_limit: "",
  }),
];

const count = async (db: Db, table: string) => {
  const res = await db.execute<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM ${table}`));
  return res.rows[0]!.n;
};

/* ---------- Разбор CSV (RFC 4180) ---------- */

describe("parseCsv: RFC 4180", () => {
  it("запятые и переводы строк внутри кавычек, экранирование двойных кавычек, номера строк", () => {
    const csv =
      'title,venue,description\n"Спектакль, премьера","Театр","анонс:\nдве строки, кавычки ""Гроза"""\n"Второй","ДК","кратко"';
    const t = parseCsv(csv);
    expect(t.delimiter).toBe(",");
    expect(t.records).toHaveLength(3);
    expect(t.records[1]!.line).toBe(2);
    expect(t.records[1]!.cells).toEqual(["Спектакль, премьера", "Театр", 'анонс:\nдве строки, кавычки "Гроза"']);
    // физический номер строки учитывает перевод внутри кавычек
    expect(t.records[2]!.line).toBe(4);
  });

  it("разделитель «;» определяется по строке заголовков, BOM и пустые строки пропускаются", () => {
    const csv = "\uFEFFtitle;city\nКурай;Уфа\r\n\r\n\rВечер;Сибай\r\n";
    const t = parseCsv(csv);
    expect(t.delimiter).toBe(";");
    expect(t.records.map((r) => r.cells)).toEqual([
      ["title", "city"],
      ["Курай", "Уфа"],
      ["Вечер", "Сибай"],
    ]);
  });

  it("числа с запятой не путаются с разделителем «;», точки с запятой в кавычках сохраняются", () => {
    const t = parseCsv('lat;lon;tags\n"54,73";"55,95";"театр;кукольный"');
    expect(t.records[1]!.cells).toEqual(["54,73", "55,95", "театр;кукольный"]);
  });
});

/* ---------- Даты ---------- */

describe("parseImportDate: ISO 8601 и «ДД.ММ.ГГГГ ЧЧ:ММ»", () => {
  it("ISO без смещения — часовой пояс региона +05:00", () => {
    expect(parseImportDate("2027-03-14T18:00:00")?.toISOString()).toBe("2027-03-14T13:00:00.000Z");
    expect(parseImportDate("2027-03-14 18:00")?.toISOString()).toBe("2027-03-14T13:00:00.000Z");
  });
  it("ISO со смещением и Z сохраняются как есть", () => {
    expect(parseImportDate("2027-03-14T18:00:00+05:00")?.toISOString()).toBe("2027-03-14T13:00:00.000Z");
    expect(parseImportDate("2027-03-14T18:00:00Z")?.toISOString()).toBe("2027-03-14T18:00:00.000Z");
  });
  it("русский формат: «14.03.2027 18:00» = тот же момент, что ISO с +05:00", () => {
    expect(parseImportDate("14.03.2027 18:00")?.getTime()).toBe(
      parseImportDate("2027-03-14T18:00:00+05:00")?.getTime(),
    );
  });
  it("дата без времени: date_start — 00:00, date_end (endOfDay) — 23:59:59", () => {
    expect(parseImportDate("2027-04-10")?.toISOString()).toBe("2027-04-09T19:00:00.000Z"); // 00:00 +05
    expect(parseImportDate("10.04.2027", true)?.toISOString()).toBe("2027-04-10T18:59:59.000Z"); // 23:59:59 +05
  });
  it("неверные даты — null: 31 февраля, 13-й месяц, мусор", () => {
    expect(parseImportDate("31.02.2027")).toBeNull();
    expect(parseImportDate("2027-13-01")).toBeNull();
    expect(parseImportDate("завтра")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

/* ---------- Цены ---------- */

describe("parsePriceField: текст цены", () => {
  it("«вход свободный» — бесплатное событие", () => {
    expect(parsePriceField("Вход свободный")).toEqual({ min: null, max: null, free: true });
    expect(parsePriceField("бесплатно для всех")).toEqual({ min: null, max: null, free: true });
  });
  it("«от 300 до 800» — диапазон", () => {
    expect(parsePriceField("от 300 до 800 руб.")).toEqual({ min: 300, max: 800, free: false });
  });
  it("одиночная цена и диапазон через дефис", () => {
    expect(parsePriceField("500")).toEqual({ min: 500, max: 500, free: false });
    expect(parsePriceField("300–500")).toEqual({ min: 300, max: 500, free: false });
    expect(parsePriceField("")).toEqual({ min: null, max: null, free: false });
  });
});

/* ---------- multipart и формат файла ---------- */

describe("parseMultipart: поле file", () => {
  it("достаёт имя файла и содержимое (CRLF и LF)", () => {
    const csv = "title,city\nКурай,Уфа\n";
    const crlf = [
      "--X1",
      'Content-Disposition: form-data; name="file"; filename="events.csv"',
      "Content-Type: text/csv",
      "",
      csv,
      "--X1--",
      "",
    ].join("\r\n");
    const parts = parseMultipart(Buffer.from(crlf, "utf8"), "multipart/form-data; boundary=X1");
    expect(parts.get("file")?.filename).toBe("events.csv");
    expect(parts.get("file")?.data.toString("utf8")).toBe(csv);

    const lf = ["--X1", 'Content-Disposition: form-data; name="dry_run"', "", "true", "--X1--", ""].join("\n");
    const lfParts = parseMultipart(Buffer.from(lf, "utf8"), `multipart/form-data; boundary="X1"`);
    expect(lfParts.get("dry_run")?.data.toString("utf8")).toBe("true");
  });
});

describe("parseFile: CSV и JSON", () => {
  it("JSON: массив объектов или {events}", () => {
    const arr = parseFile('[{"title": "Курай", "age_limit": 0}]');
    expect(arr.format).toBe("json");
    expect(arr.records[0]!.fields).toEqual({ title: "Курай", age_limit: 0 });
    const obj = parseFile('{"events": [{"title": "Курай"}]}', "e.json");
    expect(obj.records).toHaveLength(1);
    expect(obj.records[0]!.fields.title).toBe("Курай");
  });
  it("числа в JSON эквивалентны строкам CSV: тот же ключ строки, дубликата нет", () => {
    const muni = (city: string) => ({ id: "ufa", title: city });
    const csvRow = normalizeRow(
      parseFile(toCsv([{ title: "Т", city: "Уфа", date_start: "15.03.2027 18:00", venue: "ДК", age_limit: "6" }]))
        .records[0]!,
      muni,
    );
    const jsonRow = normalizeRow(
      parseFile(
        JSON.stringify([{ title: "Т", city: "Уфа", date_start: "15.03.2027 18:00", venue: "ДК", age_limit: 6 }]),
      ).records[0]!,
      muni,
    );
    expect("reason" in csvRow ? "" : csvRow.externalId).toBe("reason" in jsonRow ? "" : jsonRow.externalId);
  });
  it("битый JSON и чужая структура — ImportFormatError", () => {
    expect(() => parseFile('{"events": [')).toThrow(ImportFormatError);
    expect(() => parseFile('{"data": []}', "x.json")).toThrow(ImportFormatError);
  });
  it("CSV без обязательных колонок — ImportFormatError с перечнем", () => {
    try {
      parseFile("title,city\nКурай,Уфа");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ImportFormatError);
      expect((err as Error).message).toContain("age_limit");
    }
  });
});

/* ---------- Запись в БД ---------- */

describe("importFile: запись и отчёт", () => {
  let db: Db;
  beforeAll(async () => {
    db = await resetDb();
  });

  it("отчёт: 2 добавлено, 1 отклонено с причиной на русском", async () => {
    const report = await importFile(db, { content: toCsv(sampleRows), filename: "events.csv" });
    expect(report.format).toBe("csv");
    expect(report.dry_run).toBe(false);
    expect(report.total).toBe(3);
    expect(report.added).toBe(2);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]!.row).toBe(4); // физическая строка файла: заголовок + 2 данные
    expect(report.rejected[0]!.reason).toContain("возрастной знак");
    expect(report.rejected[0]!.reason).toContain("436-ФЗ");
  });

  it("в БД: цены диапазона, бесплатность и сырые поля строки в source_record", async () => {
    const paid = (
      await db.execute<{ price_min: string; price_max: string; is_free: boolean; age: number }>(sql`
        SELECT price_min, price_max, is_free, age_rating AS age FROM event WHERE title->>'ru' = 'Концерт «Курай весны»'`)
    ).rows[0]!;
    expect(paid.price_min).toBe("300.00");
    expect(paid.price_max).toBe("800.00");
    expect(paid.is_free).toBe(false);
    expect(paid.age).toBe(6);

    const free = (
      await db.execute<{ is_free: boolean; price_min: string; tags: string[] }>(sql`
        SELECT is_free, price_min, tags FROM event WHERE title->>'ru' = 'Выставка «Краски Севера»'`)
    ).rows[0]!;
    expect(free.is_free).toBe(true);
    expect(free.price_min).toBe("0.00");
    expect(free.tags).toContain("free");
    // «г. Уфа» нормализуется в «Уфа», площадка привязана к муниципалитету
    const venue = (
      await db.execute<{ muni: string; name: string }>(sql`
        SELECT municipality_id AS muni, name->>'ru' AS name FROM venue WHERE name->>'ru' = 'Концертный зал «Башкортостан»'`)
    ).rows[0]!;
    expect(venue.muni).toBe("ufa");

    const records = (
      await db.execute<{ payload: Record<string, unknown>; src: string }>(sql`
        SELECT payload, source_id AS src FROM source_record WHERE source_id = 'import'`)
    ).rows;
    expect(records).toHaveLength(2);
    const paidRaw = records.find((r) => r.payload.title === "Концерт «Курай весны»");
    expect(paidRaw?.payload.price_min).toBe("от 300 до 800");
    expect(paidRaw?.payload.city).toBe("г. Уфа"); // сырые поля хранятся как в файле, до нормализации
  });

  it("повторная загрузка того же файла: 0 новых, всё «без изменений», дубликатов нет", async () => {
    const events = await count(db, "event");
    const occurrences = await count(db, "occurrence");
    const report = await importFile(db, { content: toCsv(sampleRows), filename: "events.csv" });
    expect(report.added).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(report.rejected).toHaveLength(1); // отклонённая строка считается заново, но не пишется
    expect(await count(db, "event")).toBe(events);
    expect(await count(db, "occurrence")).toBe(occurrences);
  });

  it("изменение строки — обновление события, не дубликат", async () => {
    const changed = sampleRows.map((r) => (r.title === "Концерт «Курай весны»" ? { ...r, price_min: "500" } : r));
    const report = await importFile(db, { content: toCsv(changed), filename: "events.csv" });
    expect(report.added).toBe(0);
    expect(report.updated).toBe(1);
    expect(await count(db, "event")).toBe(2);
    const price = (
      await db.execute<{ p: string }>(
        sql`SELECT price_min AS p FROM event WHERE title->>'ru' = 'Концерт «Курай весны»'`,
      )
    ).rows[0]!;
    expect(price.p).toBe("500.00");
  });

  it("статусы: черновик уходит в модерацию, «отменено» гасит сеансы, публикация возвращает", async () => {
    const base = row({
      title: "Мастер-класс по гончарному делу",
      category: "мастер-класс",
      date_start: "20.05.2027 12:00",
      city: "Уфа",
      venue: "Дом ремёсел",
      price_min: "300",
      age_limit: "12",
    });
    const withStatus = (status: string) => toCsv([{ ...base, status }]);

    await importFile(db, { content: withStatus("черновик"), filename: "s.csv" });
    const ev = (
      await db.execute<{ m: string }>(
        sql`SELECT moderation_status AS m FROM event WHERE title->>'ru' = 'Мастер-класс по гончарному делу'`,
      )
    ).rows[0]!;
    expect(ev.m).toBe("pending");

    await importFile(db, { content: withStatus("отменено"), filename: "s.csv" });
    let occ = (
      await db.execute<{ s: string; r: string | null }>(sql`
        SELECT o.status AS s, o.status_reason AS r FROM occurrence o
        JOIN event e ON e.id = o.event_id WHERE e.title->>'ru' = 'Мастер-класс по гончарному делу'`)
    ).rows[0]!;
    expect(occ.s).toBe("cancelled");
    expect(occ.r).toContain("Отменено в импортируемом файле");

    await importFile(db, { content: withStatus("опубликовано"), filename: "s.csv" });
    occ = (
      await db.execute<{ s: string; r: string | null }>(sql`
        SELECT o.status AS s, o.status_reason AS r FROM occurrence o
        JOIN event e ON e.id = o.event_id WHERE e.title->>'ru' = 'Мастер-класс по гончарному делу'`)
    ).rows[0]!;
    expect(occ.s).toBe("scheduled");
    expect(occ.r).toBeNull();
  });

  it("CSV и JSON эквивалентны: тот же файл в JSON ничего не добавляет", async () => {
    const events = await count(db, "event");
    const json = JSON.stringify(
      sampleRows
        .filter((r) => r.title !== "Квиз без возрастного знака")
        .map((r) => ({ ...r, price_min: r.title === "Концерт «Курай весны»" ? "500" : r.price_min })),
    );
    const report = await importFile(db, { content: json, filename: "events.json" });
    expect(report.format).toBe("json");
    expect(report.added).toBe(0);
    expect(report.updated).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(await count(db, "event")).toBe(events);
  });

  it("dry_run ничего не пишет и не создаёт", async () => {
    const events = await count(db, "event");
    const report = await importFile(db, {
      content: toCsv([
        row({
          title: "Сухой прогон",
          category: "концерт",
          date_start: "01.06.2027 18:00",
          city: "Уфа",
          venue: "ДК",
          age_limit: "6",
        }),
      ]),
      filename: "dry.csv",
      dryRun: true,
    });
    expect(report.dry_run).toBe(true);
    expect(report.added).toBe(1);
    expect(report.rejected).toHaveLength(0);
    expect(await count(db, "event")).toBe(events);
    expect(await count(db, "source_run")).toBeGreaterThanOrEqual(1); // прогоны реальных импортов записаны
  });
});

/* ---------- Идемпотентность на 100 событиях ---------- */

describe("importFile: 100 событий", () => {
  let db: Db;
  beforeAll(async () => {
    db = await resetDb();
  });
  const hundred = Array.from({ length: 100 }, (_, i) =>
    row({
      title: `Событие №${i + 1}`,
      category: i % 2 ? "спектакль" : "концерт",
      tags: i % 3 === 0 ? "для всей семьи" : "",
      date_start: `1${(i % 9) + 1}.09.2027 18:00`,
      city: i % 4 === 0 ? "Сибай" : "Уфа",
      venue: `ДК №${i % 10}`,
      price_min: "200",
      age_limit: "6",
    }),
  );
  const csv = toCsv(hundred);

  it("первый импорт: 100 добавлено", async () => {
    const report = await importFile(db, { content: csv, filename: "100.csv" });
    expect(report.added).toBe(100);
    expect(report.rejected).toHaveLength(0);
    expect(await count(db, "event")).toBe(100);
  });

  it("повторный импорт: 0 новых, 100 «без изменений», событий и сеансов столько же", async () => {
    const events = await count(db, "event");
    const occurrences = await count(db, "occurrence");
    const venues = await count(db, "venue");
    const report = await importFile(db, { content: csv, filename: "100.csv" });
    expect(report.added).toBe(0);
    expect(report.unchanged).toBe(100);
    expect(report.updated).toBe(0);
    expect(await count(db, "event")).toBe(events);
    expect(await count(db, "occurrence")).toBe(occurrences);
    expect(await count(db, "venue")).toBe(venues); // площадки не дублируются
  });
});

/* ---------- HTTP-маршрут ---------- */

describe("POST /admin/import", () => {
  let app: FastifyInstance;
  const auth = { authorization: "Bearer dev-admin-token" };
  const csv = toCsv([
    row({
      title: "Концерт из формы",
      category: "концерт",
      date_start: "30.09.2027 18:00",
      city: "Уфа",
      venue: "ДК",
      age_limit: "6",
    }),
  ]);
  const multipart = (filename: string, content: string) => {
    const boundary = "----afisha-test";
    return [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      "Content-Type: text/csv",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("без токена — 401", async () => {
    const r = await app.inject({ method: "POST", url: "/admin/import", payload: multipart("e.csv", csv) });
    expect(r.statusCode).toBe(401);
  });

  it("multipart с полем file — отчёт 200", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/admin/import",
      headers: { ...auth, "content-type": "multipart/form-data; boundary=----afisha-test" },
      payload: multipart("events.csv", csv),
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.format).toBe("csv");
    expect(body.filename).toBe("events.csv");
    expect(body.added).toBe(1);
    expect(body.dry_run).toBe(false);
  });

  it("JSON {content} — отчёт 200", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/admin/import",
      headers: auth,
      payload: {
        content: JSON.stringify([
          { title: "Из JSON", date_start: "01.10.2027 18:00", city: "Уфа", venue: "ДК", age_limit: "6" },
        ]),
      },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().added).toBe(1);
  });

  it("мусорный формат — 400 problem+json", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/admin/import",
      headers: auth,
      payload: { content: "title,city\nнет обязательных колонок" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().status).toBe(400);
    expect(r.json().title).toContain("обязательных колонок");
  });

  it("организации (не министерство) — 403", async () => {
    // временно добавляем токен учреждения в таблицу субъектов
    const saved = config.AFISHA_ADMIN_TOKENS;
    config.AFISHA_ADMIN_TOKENS = JSON.stringify([
      {
        token: "test-org-token-1234567890",
        name: "Театр кукол",
        role: "organization",
        organization_id: "00000000-0000-4000-8000-000000000001",
      },
    ]);
    resetAuthCache();
    try {
      const r = await app.inject({
        method: "POST",
        url: "/admin/import",
        headers: { authorization: "Bearer test-org-token-1234567890" },
        payload: { content: "[]" },
      });
      expect(r.statusCode).toBe(403);
    } finally {
      config.AFISHA_ADMIN_TOKENS = saved;
      resetAuthCache();
    }
  });
});

afterAll(async () => {
  await closeDb();
});
