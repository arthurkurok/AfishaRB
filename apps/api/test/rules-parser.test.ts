/** Разбор запросов на правилах. «Сейчас» — понедельник 2 ноября 2026, 10:00 по Уфе. */
import { describe, expect, it } from "vitest";
import {
  type MunicipalityRef,
  parseBudget,
  parseDates,
  parseKids,
  parseRules,
} from "../src/modules/assistant/rules-parser.js";
import { stemsFor } from "../src/modules/geo/index.js";

const NOW = new Date("2026-11-02T05:00:00Z"); // пн 10:00 +05:00
const MUNIS: MunicipalityRef[] = [
  { id: "ufa", name: "Уфа", stems: stemsFor("Уфа") },
  { id: "sterlitamak", name: "Стерлитамак", stems: [...stemsFor("Стерлитамак"), "стерлик"] },
  { id: "baymakskiy-rayon", name: "Баймакский район", stems: stemsFor("Баймакский район") },
  { id: "tuymazy", name: "Туймазы", stems: stemsFor("Туймазы") },
];

describe("даты", () => {
  it.each([
    ["куда пойти в субботу", "2026-11-07", "2026-11-07"],
    ["в следующую субботу", "2026-11-14", "2026-11-14"],
    ["на выходных", "2026-11-07", "2026-11-08"],
    ["на следующих выходных", "2026-11-14", "2026-11-15"],
    ["завтра вечером", "2026-11-03", "2026-11-03"],
    ["сегодня", "2026-11-02", "2026-11-02"],
    ["послезавтра", "2026-11-04", "2026-11-04"],
    ["7 ноября", "2026-11-07", "2026-11-07"],
    ["с 7 по 9 ноября", "2026-11-07", "2026-11-09"],
    ["15.12", "2026-12-15", "2026-12-15"],
    ["в январе", "2027-01-01", "2027-01-31"],
    ["в понедельник", "2026-11-02", "2026-11-02"],
  ])("%s → %s…%s", (text, from, to) => {
    const d = parseDates(text, NOW)!;
    expect(d.from).toBe(from);
    expect(d.to).toBe(to);
  });

  it("31 февраля — невалидная дата не превращается в событие", () => {
    expect(parseDates("31 февраля", NOW)).toBeNull();
  });

  it("в субботу 23:30 по Уфе «в субботу» — это сегодня, а не следующая", () => {
    const satNight = new Date("2026-11-07T18:30:00Z");
    expect(parseDates("в субботу", satNight)!.from).toBe("2026-11-07");
  });
});

describe("бюджет", () => {
  it.each([
    ["до 1000 рублей", 1000, "unknown"],
    ["не дороже 500 р", 500, "unknown"],
    ["до тысячи", 1000, "unknown"],
    ["до 2 тыс", 2000, "unknown"],
    ["1500 на двоих", 1500, "total"],
    ["до 700 за билет", 700, "ticket"],
  ])("%s", (text, budget, per) => {
    const b = parseBudget(text);
    expect(b.budget).toBe(budget);
    expect(b.per).toBe(per);
  });
  it("бесплатно", () => expect(parseBudget("что-нибудь бесплатное").free).toBe(true));
});

describe("дети", () => {
  it.each([
    ["с ребёнком 5 лет", [5]],
    ["с сыном 7 лет", [7]],
    ["с дочкой, ей 4 года", [4]],
    ["дочке 4 года", [4]],
    ["с пятилетним сыном", [5]],
    ["с детьми 3 и 8 лет", [3, 8]],
  ])("%s", (text, ages) => {
    const k = parseKids(text.toLowerCase().replaceAll("ё", "е"));
    expect(k.withKids).toBe(true);
    for (const a of ages) expect(k.ages).toContain(a);
  });
});

describe("полный разбор", () => {
  it("пример из ТЗ", () => {
    const s = parseRules("Куда пойти в субботу с ребёнком до 1000 рублей", NOW, MUNIS);
    expect(s).toMatchObject({
      date_from: "2026-11-07",
      date_to: "2026-11-07",
      budget: 1000,
      with_kids: true,
      kids_ages: [],
    });
    expect(s.text).toBeNull();
  });

  it("город в падеже и разговорное название", () => {
    expect(parseRules("концерт в Уфе вечером", NOW, MUNIS)).toMatchObject({
      municipality_id: "ufa",
      categories: ["music"],
      time_of_day: ["evening"],
    });
    expect(parseRules("что в стерлике на выходных", NOW, MUNIS).municipality_id).toBe("sterlitamak");
    expect(parseRules("спектакли в Баймакском районе", NOW, MUNIS).municipality_id).toBe("baymakskiy-rayon");
  });

  it("Пушкинская карта, доступная среда, бесплатно", () => {
    const s = parseRules("бесплатно по пушкинской карте, нужна доступная среда для коляски", NOW, MUNIS);
    expect(s.pushkin).toBe(true);
    expect(s.accessible).toBe(true);
    expect(s.free_only).toBe(true);
  });

  it("название произведения уходит в полнотекстовый поиск", () => {
    expect(parseRules("Лебединое озеро", NOW, MUNIS).text).toBe("лебединое озеро");
  });

  it("приветствие — это help, а не поиск", () => {
    expect(parseRules("Привет!", NOW, MUNIS).intent).toBe("help");
  });

  it("башкирский запрос: завтра, Өфө", () => {
    const s = parseRules("иртәгә Өфөлә концерт", NOW, [{ id: "ufa", name: "Уфа", stems: [...stemsFor("Уфа"), "өфө"] }]);
    expect(s.date_from).toBe("2026-11-03");
    expect(s.municipality_id).toBe("ufa");
    expect(s.categories).toContain("music");
  });
});
