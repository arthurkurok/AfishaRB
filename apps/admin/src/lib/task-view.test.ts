import { describe, expect, it } from "vitest";
import { payloadFacts, sourceLabel, taskTitle, validationProblems, vanishedView } from "./task-view";

const UFA = "Asia/Yekaterinburg";
const now = new Date("2026-11-15T10:00:00+05:00");

const vanished = {
  kind: "vanished",
  title_a: null,
  title_b: null,
  payload: {
    title: "Спектакль «Буратино»",
    source: "culture_ru",
    actions: ["confirm", "cancel"],
    starts_at: "2026-11-17T09:00:00.000Z",
  },
};

describe("название задачи", () => {
  it("берётся из title_a, а без него — из payload.title", () => {
    expect(taskTitle({ ...vanished, title_a: "Из каталога" })).toBe("Из каталога");
    expect(taskTitle(vanished)).toBe("Спектакль «Буратино»");
  });

  it("без названия — null (подпись выбирает интерфейс)", () => {
    expect(taskTitle({ kind: "source_error", title_a: null, payload: { source: "bashopera" } })).toBeNull();
    expect(taskTitle({ kind: "vanished", title_a: null, payload: null })).toBeNull();
  });
});

describe("источник по-русски", () => {
  it("известные источники", () => {
    expect(sourceLabel("culture_ru")).toBe("Культура.РФ");
    expect(sourceLabel("bashopera")).toBe("Сайт Башкирского театра оперы и балета");
    expect(sourceLabel("import")).toBe("Файловый импорт министерства");
  });
  it("незнакомый источник — как есть", () => {
    expect(sourceLabel("new_source")).toBe("new_source");
  });
});

describe("исчезнувший сеанс", () => {
  it("дата и время — в часовом поясе региона, сеанс ещё впереди", () => {
    const v = vanishedView(vanished, UFA, now);
    expect(v.title).toBe("Спектакль «Буратино»");
    expect(v.when).toBe("вторник, 17 ноября, 14:00");
    expect(v.past).toBe(false);
    expect(v.source).toBe("Культура.РФ");
  });

  it("время из PostgreSQL («2026-11-14 09:00:00+00») тоже понимается", () => {
    const v = vanishedView(
      { ...vanished, payload: { ...vanished.payload, starts_at: "2026-11-14 09:00:00+00" } },
      UFA,
      now,
    );
    expect(v.when).toBe("суббота, 14 ноября, 14:00");
    expect(v.past).toBe(true);
  });

  it("без даты — when = null, сеанс не считается прошедшим", () => {
    const v = vanishedView({ ...vanished, payload: { title: "Без даты" } }, UFA, now);
    expect(v.when).toBeNull();
    expect(v.past).toBe(false);
    expect(v.source).toBeNull();
  });
});

describe("замечания к данным источника", () => {
  it("код поля превращается в подпись, текст остаётся", () => {
    const list = validationProblems({
      problems: [
        "age: нет возрастного знака (436-ФЗ) — событие не публикуется",
        "date: в описании «12 декабря»",
        "просто текст",
      ],
    });
    expect(list).toEqual([
      { field: "Возрастной знак", text: "нет возрастного знака (436-ФЗ) — событие не публикуется" },
      { field: "Дата", text: "в описании «12 декабря»" },
      { field: null, text: "просто текст" },
    ]);
  });
  it("нет списка — пустой массив", () => {
    expect(validationProblems(null)).toEqual([]);
    expect(validationProblems({ problems: "строка" })).toEqual([]);
  });
});

describe("человекочитаемые поля вместо JSON", () => {
  it("известные ключи подписаны по-русски и идут по смыслу, служебные скрыты", () => {
    const facts = payloadFacts(
      {
        source: "bashopera",
        message: "изменилась вёрстка",
        run_id: 812,
        actions: ["confirm"],
        starts_at: "2026-11-17T09:00:00Z",
      },
      UFA,
      now,
    );
    expect(facts).toEqual([
      { label: "Источник", value: "Сайт Башкирского театра оперы и балета" },
      { label: "Начало", value: "вторник, 17 ноября, 14:00" },
      { label: "Сообщение", value: "изменилась вёрстка" },
      { label: "Прогон загрузки", value: "812" },
    ]);
  });

  it("вложенные объекты не выводятся сырым JSON", () => {
    const facts = payloadFacts({ nested: { a: 1 }, list: ["x", "y"], flag: true }, UFA, now);
    expect(facts).toEqual([
      { label: "list", value: "x, y" },
      { label: "flag", value: "да" },
    ]);
    expect(facts.some((f) => f.value.includes("{"))).toBe(false);
  });
});

describe("исчезнувший сеанс по данным API от 15.11", () => {
  const fresh = {
    ...vanished,
    title_a: "Буратино",
    event_id: "e1",
    group_size: 3,
    occurrence: {
      event_id: "e1",
      starts_at: "2026-11-21T12:00:00+05:00",
      venue: { name: "Театр кукол" },
      municipality: "Уфа",
    },
  };

  it("время и площадка — из сеанса, а не из снимка payload", () => {
    const v = vanishedView(fresh, UFA, now);
    expect(v.title).toBe("Буратино");
    expect(v.when).toBe("суббота, 21 ноября, 12:00");
    expect(v.place).toBe("Театр кукол, Уфа");
    expect(v.eventId).toBe("e1");
    expect(v.groupSize).toBe(3);
  });

  it("город не повторяется, если уже есть в названии площадки", () => {
    const v = vanishedView(
      { ...fresh, occurrence: { ...fresh.occurrence, venue: { name: "Уфимский театр «Нур»" } } },
      UFA,
      now,
    );
    expect(v.place).toBe("Уфимский театр «Нур», Уфа");
    const w = vanishedView({ ...fresh, occurrence: { ...fresh.occurrence, venue: { name: "ДК, Уфа" } } }, UFA, now);
    expect(w.place).toBe("ДК, Уфа");
  });

  it("прежняя версия API: нет полей — одна задача, места нет", () => {
    const v = vanishedView(vanished, UFA, now);
    expect(v.place).toBeNull();
    expect(v.eventId).toBeNull();
    expect(v.groupSize).toBe(1);
  });
});
