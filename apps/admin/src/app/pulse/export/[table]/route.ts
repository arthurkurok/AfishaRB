/**
 * Выгрузка таблицы «Пульса культуры» в CSV (для ведомственной отчётности). Файл собирает сервер:
 * данные берутся из Admin API с токеном из сессии, в браузер уходит только готовая таблица.
 */
import { type NextRequest, NextResponse } from "next/server";
import { getDashboard } from "@/lib/admin-api";
import { REGION_TZ } from "@/lib/config";
import { type CsvColumn, csvFileName, toCsv } from "@/lib/csv";
import { todayIn } from "@/lib/datetime";
import { isPulseTable, PULSE_TABLES, parsePeriod, tableRows } from "@/lib/pulse";
import { loginHref, readSession } from "@/lib/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!isPulseTable(table)) return NextResponse.json({ title: "Нет такой таблицы" }, { status: 404 });
  const days = parsePeriod(request.nextUrl.searchParams.get("days"));
  const session = await readSession();
  if (!session) return NextResponse.redirect(new URL(loginHref(`/?days=${days}`), request.url));
  if (session.role !== "ministry") return NextResponse.json({ title: "Доступно министерству" }, { status: 403 });

  const dashboard = await getDashboard(days, `/?days=${days}`);
  const def = PULSE_TABLES[table];
  const csv = toCsv(def.columns as CsvColumn<unknown>[], tableRows(dashboard, table));
  const fileName = csvFileName(table, days, todayIn(REGION_TZ));
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store",
    },
  });
}
