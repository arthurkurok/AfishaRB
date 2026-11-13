import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, toCsv } from "./csv";

describe("csvCell", () => {
  it("пустые значения и булевы", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("да");
    expect(csvCell(false)).toBe("нет");
  });

  it("числа без кавычек, NaN — пусто", () => {
    expect(csvCell(1234)).toBe("1234");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("экранирует разделитель, кавычки и переводы строк", () => {
    expect(csvCell("Театр; кукол")).toBe('"Театр; кукол"');
    expect(csvCell('МАУК "РДК"')).toBe('"МАУК ""РДК"""');
    expect(csvCell("две\nстроки")).toBe('"две\nстроки"');
    expect(csvCell(" пробел по краям ")).toBe('" пробел по краям "');
  });

  it("запятая не требует кавычек при разделителе «;», но требует при «,»", () => {
    expect(csvCell("Уфа, Стерлитамак")).toBe("Уфа, Стерлитамак");
    expect(csvCell("Уфа, Стерлитамак", ",")).toBe('"Уфа, Стерлитамак"');
  });

  it("защищает от CSV-инъекции формул в пользовательских запросах", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+79991234567")).toBe("'+79991234567");
    expect(csvCell("-концерт")).toBe("'-концерт");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

describe("toCsv", () => {
  const rows = [
    { name: "Уфа", n: 1200, kids: true },
    { name: "Агидель; город", n: 62, kids: false },
  ];
  const columns = [
    { header: "Муниципалитет", value: (r: (typeof rows)[number]) => r.name },
    { header: "Сеансов", value: (r: (typeof rows)[number]) => r.n },
    { header: "Детям", value: (r: (typeof rows)[number]) => r.kids },
  ];

  it("BOM, заголовок, CRLF и экранирование", () => {
    const csv = toCsv(columns, rows);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1)).toBe('Муниципалитет;Сеансов;Детям\r\nУфа;1200;да\r\n"Агидель; город";62;нет\r\n');
  });

  it("без BOM и с другим разделителем", () => {
    expect(toCsv(columns, rows.slice(0, 1), { bom: false, delimiter: "," })).toBe(
      "Муниципалитет,Сеансов,Детям\r\nУфа,1200,да\r\n",
    );
  });

  it("пустая таблица — только заголовок", () => {
    expect(toCsv(columns, [], { bom: false })).toBe("Муниципалитет;Сеансов;Детям\r\n");
  });
});

describe("csvFileName", () => {
  it("безопасное имя файла", () => {
    expect(csvFileName("demand-gaps", 30, "2026-11-02")).toBe("pulse-demand-gaps-30d-2026-11-02.csv");
    expect(csvFileName("../../etc", 7, "2026-11-02")).toBe("pulse-------etc-7d-2026-11-02.csv");
  });
});
