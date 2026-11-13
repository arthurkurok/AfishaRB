/**
 * Экспорт таблиц в CSV для ведомственной отчётности. По умолчанию — под Excel с русской локалью:
 * разделитель «;», UTF-8 с BOM (иначе кириллица превращается в «кракозябры»), переводы строк CRLF.
 * Строковые ячейки, начинающиеся с = + - @ (а также табуляции и возврата каретки), экранируются апострофом:
 * поисковые запросы жителей попадают в выгрузку, и формула в них не должна исполниться в Excel (CSV injection).
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

export interface CsvOptions {
  delimiter?: string;
  bom?: boolean;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | boolean | null | undefined, delimiter = ";"): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  const needsQuotes =
    s.includes(delimiter) || s.includes('"') || s.includes("\n") || s.includes("\r") || s !== s.trim();
  return needsQuotes ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: readonly T[], opts: CsvOptions = {}): string {
  const delimiter = opts.delimiter ?? ";";
  const lines = [
    columns.map((c) => csvCell(c.header, delimiter)).join(delimiter),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row), delimiter)).join(delimiter)),
  ];
  return `${opts.bom === false ? "" : "﻿"}${lines.join("\r\n")}\r\n`;
}

/** Безопасное имя файла выгрузки: «pulse-demand-gaps-30d-2026-11-02.csv». */
export function csvFileName(table: string, days: number, today: string): string {
  const safe = table.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `pulse-${safe}-${days}d-${today}.csv`;
}
