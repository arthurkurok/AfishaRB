/** Парсер HTML-афиши Башоперы (фикстура — снимок bashopera.ru/affiche/, 3 месяца с переходом года). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASHOPERA_SOURCE_ID, parseAffiche, parsePriceText } from "../src/modules/ingestion/normalize-bashopera.js";

const NOW = new Date("2026-11-02T10:00:00Z");
const html = readFileSync(new URL("./fixtures/bashopera-affiche.html", import.meta.url), "utf8");
const parsed = parseAffiche(html, NOW);
const byTitle = (title: string) => parsed.find((p) => p.event.title === title)!;

/** Синтетический элемент афиши: в фикстуре div.price пустые, цены проверяем на «выдуманном» HTML. */
const item = (n: number, day: number, price: string) => `
	<div class="item content fm-10 fs-0 fs-2" id="bx_1_${n}">
		<div class="date"><strong>${day} ноября</strong></div>
		<div class="name"><a href="/repertoire/opera/999/">Тест-опера</a></div>
		<div class="hall"><strong><a href="/tickets/halls/234/?template=blank">Большой зал</a>, 19:00</strong></div>
		<div class="price">${price}</div>
		<a href="/repertoire/opera/999/100${n}/" class="b-byu-btn">Билеты</a>
	</div>`;
const synthetic = (...prices: string[]) =>
  `<div class="items"><div class="item title">Ноябрь</div>${prices.map((p, i) => item(i + 1, 5 + i, p)).join("")}</div>`;

describe("parseAffiche (фикстура bashopera.ru/affiche/)", () => {
  it("собирает 22 постановки и 65 сеансов с уникальными ключами", () => {
    expect(parsed).toHaveLength(22);
    expect(parsed.reduce((n, p) => n + p.event.sessions.length, 0)).toBe(65);
    expect(new Set(parsed.map((p) => p.event.externalId)).size).toBe(22);
    expect(new Set(parsed.flatMap((p) => p.event.sessions.map((s) => s.externalId))).size).toBe(65);
    expect(parsed.every((p) => p.event.sourceId === BASHOPERA_SOURCE_ID)).toBe(true);
  });

  it("узнаёт постановки афиши", () => {
    expect(byTitle("Травиата").event.externalId).toBe("15866");
    expect(byTitle("Щелкунчик").event.externalId).toBe("289");
    expect(byTitle("Летучий корабль").event.externalId).toBe("11932");
    expect(byTitle("Новый год в BashOpera").event.externalId).toBe("14615");
  });

  it("переводит местное время (UTC+5) в timestamptz", () => {
    const traviata = byTitle("Травиата").event;
    expect(traviata.sessions.find((s) => s.externalId === "15867")!.startsAt.toISOString()).toBe(
      "2026-11-13T14:00:00.000Z",
    );
    const shchelkunchik = byTitle("Щелкунчик").event;
    expect(shchelkunchik.sessions.find((s) => s.externalId === "15870")!.startsAt.toISOString()).toBe(
      "2026-11-22T07:00:00.000Z",
    );
  });

  it("восстанавливает год с переходом через Новый год", () => {
    // январь меньше ноября → год увеличивается: 2026-11 → 2026-12 → 2027-01
    const letuchiy = byTitle("Летучий корабль").event;
    expect(letuchiy.sessions.find((s) => s.externalId === "15933")!.startsAt.toISOString()).toBe(
      "2027-01-03T07:00:00.000Z",
    );
    const traviata = byTitle("Травиата").event;
    expect(traviata.sessions.filter((s) => s.startsAt.getUTCFullYear() === 2027)).toHaveLength(2);
  });

  it("группирует показы одной постановки в одно событие", () => {
    // 13 и 14 ноября + 16 и 17 января — четыре показа «Травиаты»
    const traviata = byTitle("Травиата");
    expect(traviata.event.sessions.map((s) => s.externalId)).toEqual(["15867", "15868", "15943", "15944"]);
    expect(traviata.raw.performances).toHaveLength(4);
    expect((traviata.raw.performances as Record<string, unknown>[])[0]).toMatchObject({
      id: "15867",
      date: "13.11.2026",
      time: "19:00",
      hall_id: "234",
    });
  });

  it("категории и возраст определяются по разделу афиши", () => {
    expect(byTitle("Травиата").event.categories).toEqual(["theatre"]); // fs-2 Опера
    expect(byTitle("Травиата").event.ageRating).toBe(16);
    expect(byTitle("Щелкунчик").event.categories).toEqual(["theatre"]); // fs-7 Балет
    expect(byTitle("Щелкунчик").event.ageRating).toBe(6);
    expect(byTitle("Летучий корабль").event.categories).toEqual(["kids", "theatre"]); // fs-5 детям
    expect(byTitle("Новый год в BashOpera").event.categories).toEqual(["music"]); // fs-6 Концерт
    expect(byTitle("Новый год в BashOpera").event.ageRating).toBe(12);
  });

  it("Пушкинская карта и теги постановки", () => {
    const traviata = byTitle("Травиата").event;
    expect(traviata.pushkinCard).toBe(true);
    expect(traviata.tags).toEqual(["premiere", "pushkin"]);
    expect(byTitle("Новый год в BashOpera").event.pushkinCard).toBe(false);
    expect(byTitle("Кодаса").event.pushkinCard).toBe(true);
  });

  it("площадки: залы театра в Уфе, координаты не выдумываем", () => {
    const traviata = byTitle("Травиата").event;
    expect(traviata.venues.map((v) => v.externalId)).toEqual(["basho:234"]);
    expect(traviata.venues[0]!.name).toContain("Большой зал");
    expect(traviata.venues[0]!.address).toBe("г. Уфа, ул. Ленина, 5/1");
    expect(traviata.venues[0]!.municipalityId).toBe("ufa");
    expect(traviata.venues[0]!.lat).toBeNull();
    expect(traviata.venues[0]!.lon).toBeNull();
    expect(traviata.venues[0]!.externalIds).toEqual({ bashopera_hall_id: "234" });
    // Малый зал — другая площадка с собственным ключом
    const kodasa = byTitle("Кодаса").event;
    expect(kodasa.venues.map((v) => v.externalId)).toEqual(["basho:235"]);
    expect(kodasa.venues[0]!.name).toContain("Малый зал");
    // организация — сам театр
    expect(traviata.organization).toMatchObject({
      externalId: "basho:theatre",
      name: "Башкирский государственный академический театр оперы и балета",
      externalIds: { bashopera_org_id: "theatre" },
    });
  });

  it("ссылки на постановку и на билеты конкретного показа", () => {
    const traviata = byTitle("Травиата").event;
    expect(traviata.sourceUrl).toBe("https://bashopera.ru/repertoire/opera/15866/");
    expect(traviata.ticketUrl).toBe("https://bashopera.ru/repertoire/opera/15866/15867/");
    expect(traviata.sessions[0]!.ticketUrl).toBe("https://bashopera.ru/repertoire/opera/15866/15867/");
    expect(traviata.sessions[1]!.ticketUrl).toBe("https://bashopera.ru/repertoire/opera/15866/15868/");
  });

  it("аннотация собирается из жанра, композитора и пометок", () => {
    expect(byTitle("Травиата").event.summary).toBe("Опера. Музыка Джузеппе Верди. Премьера");
    expect(byTitle("Щелкунчик").event.summary).toBe("Балет. Музыка Пётр Чайковский");
    expect(byTitle("Травиата").event.sourceGenres).toEqual(["Опера", "Джузеппе Верди"]);
  });
});

describe("parsePriceText и агрегация цен", () => {
  it("диапазон «от X до Y ₽», одна цена и пробел-разделитель тысяч", () => {
    expect(parsePriceText("от 300 до 1 500 ₽")).toEqual({ min: 300, max: 1500, free: false });
    expect(parsePriceText("от&nbsp;500&nbsp;₽")).toEqual({ min: 500, max: null, free: false });
    expect(parsePriceText("")).toEqual({ min: null, max: null, free: false });
  });

  it("«Бесплатно» и пустая цена", () => {
    expect(parsePriceText("Бесплатно")).toEqual({ min: null, max: null, free: true });
    expect(parsePriceText("   ")).toEqual({ min: null, max: null, free: false });
  });

  it("мин/макс агрегируются по всем показам постановки", () => {
    const event = parseAffiche(synthetic("от 300 до 1 500 ₽", "от 1 200 ₽"), NOW).map((p) => p.event)[0]!;
    expect(event.priceMin).toBe("300.00");
    expect(event.priceMax).toBe("1500.00");
    expect(event.isFree).toBe(false);
    expect(event.tags).not.toContain("free");
  });

  it("бесплатной постановка считается, только если бесплатны все показы", () => {
    const all = parseAffiche(synthetic("Бесплатно", "Бесплатно"), NOW).map((p) => p.event);
    expect(all[0]!.isFree).toBe(true);
    expect(all[0]!.tags).toContain("free");
    expect(all[0]!.priceMin).toBeNull();
    const mixed = parseAffiche(synthetic("Бесплатно", "от 500 ₽"), NOW).map((p) => p.event);
    expect(mixed[0]!.isFree).toBe(false);
    expect(mixed[0]!.priceMin).toBe("500.00");
  });

  it("в фикстуре цены не заполнены — priceMin/priceMax остаются null", () => {
    expect(byTitle("Травиата").event.priceMin).toBeNull();
    expect(byTitle("Травиата").event.priceMax).toBeNull();
    expect(byTitle("Травиата").event.isFree).toBe(false);
  });
});

describe("parseAffiche устойчив к деградации источника", () => {
  it("пустая афиша даёт пустой результат без исключения", () => {
    expect(parseAffiche('<div class="b-affiche"></div>', NOW)).toEqual([]);
  });

  it("битый HTML не роняет ингест", () => {
    expect(parseAffiche("<html><body>мусор", NOW)).toEqual([]);
    expect(parseAffiche("", NOW)).toEqual([]);
    // частично битая афиша: валидные блоки разбираются, битые пропускаются
    const partial = `<div class="items"><div class="item title">Ноябрь</div>${item(1, 5, "")}<div class="item content fm-10 fs-0 fs-2"></div></div>`;
    const out = parseAffiche(partial, NOW);
    expect(out).toHaveLength(1);
    expect(out[0]!.event.sessions).toHaveLength(1);
  });
});
