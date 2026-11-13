"use client";
/**
 * «Предложение по муниципалитетам»: ранжированные столбики. По умолчанию — муниципалитеты с наименьшим числом
 * сеансов (главный вопрос министерства — где пусто). Муниципалитеты ниже порога «культурной пустыни» отмечены
 * иконкой и текстом, а не цветом (проверка палитры: акцент и нейтральный неразличимы при протанопии).
 */
import { useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard } from "@/components/charts/chart-card";
import { TableWrap } from "@/components/ui/table-wrap";
import type { SupplyRow } from "@/lib/admin-types";

type View = "low" | "high" | "all";
const TOP = 15;
const fmt = new Intl.NumberFormat("ru-RU");

export function SupplyChart({
  rows,
  days,
  threshold,
  csvHref,
}: {
  rows: SupplyRow[];
  days: number;
  threshold: number;
  csvHref: string;
}) {
  const [view, setView] = useState<View>("low");
  const asc = [...rows].sort((a, b) => a.upcoming - b.upcoming || a.name.localeCompare(b.name, "ru"));
  const desc = [...asc].reverse();
  const shown = view === "low" ? asc.slice(0, TOP) : view === "high" ? desc.slice(0, TOP) : desc;
  const items = shown.map((r) => ({
    key: r.id,
    label: r.name,
    value: r.upcoming,
    details: `сеансов · бесплатных ${fmt.format(r.free)} · по Пушкинской карте ${fmt.format(r.pushkin)} · для детей ${fmt.format(r.kids)}`,
    flag: r.upcoming < threshold ? "пустыня" : undefined,
  }));
  const label =
    view === "low"
      ? `${TOP} муниципалитетов с наименьшим числом сеансов за ${days} дн.`
      : view === "high"
        ? `${TOP} муниципалитетов с наибольшим числом сеансов за ${days} дн.`
        : `Все муниципалитеты по числу сеансов за ${days} дн.`;

  return (
    <ChartCard
      title="Предложение по муниципалитетам"
      description={
        <>
          Сеансы на ближайшие {days} дн. по городам и районам. Масштаб — по показанным строкам; точные значения — у
          столбиков и в таблице.
        </>
      }
      csvHref={csvHref}
      controls={
        <fieldset className="segmented">
          <legend className="sr-only">Какие муниципалитеты показать</legend>
          <button type="button" aria-pressed={view === "low"} onClick={() => setView("low")}>
            Меньше всего
          </button>
          <button type="button" aria-pressed={view === "high"} onClick={() => setView("high")}>
            Больше всего
          </button>
          <button type="button" aria-pressed={view === "all"} onClick={() => setView("all")}>
            Все {rows.length}
          </button>
        </fieldset>
      }
      chart={<BarList items={items} label={label} />}
      table={
        <TableWrap label="Таблица: предложение по муниципалитетам">
          <table className="table">
            <caption className="sr-only">Предложение по муниципалитетам за {days} дн.</caption>
            <thead>
              <tr>
                <th scope="col">Муниципалитет</th>
                <th scope="col" className="num">
                  Сеансов
                </th>
                <th scope="col" className="num">
                  Бесплатных
                </th>
                <th scope="col" className="num">
                  Пушкинская карта
                </th>
                <th scope="col" className="num">
                  Детям
                </th>
              </tr>
            </thead>
            <tbody>
              {asc.map((r) => (
                <tr key={r.id}>
                  <th scope="row" style={{ fontWeight: 500 }}>
                    {r.name}
                    {r.upcoming < threshold ? <span className="caption"> — культурная пустыня</span> : null}
                  </th>
                  <td className="num">{fmt.format(r.upcoming)}</td>
                  <td className="num">{fmt.format(r.free)}</td>
                  <td className="num">{fmt.format(r.pushkin)}</td>
                  <td className="num">{fmt.format(r.kids)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      }
    />
  );
}
