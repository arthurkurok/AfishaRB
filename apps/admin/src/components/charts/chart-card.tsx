"use client";
/**
 * Карточка диаграммы с табличным двойником (dataviz: у каждой диаграммы есть табличный вид — его читает скринридер
 * и в нём видны все значения без наведения). Переключатель «Диаграмма / Таблица» и выгрузка CSV — в шапке карточки.
 */
import { type ReactNode, useId, useState } from "react";
import { CsvLink } from "@/components/ui/csv-link";

export function ChartCard({
  title,
  description,
  csvHref,
  chart,
  table,
  controls,
}: {
  title: string;
  description?: ReactNode;
  csvHref?: string;
  chart: ReactNode;
  table: ReactNode;
  controls?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const id = useId();
  return (
    <section className="card stack" aria-labelledby={`${id}-title`}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="stack" style={{ gap: "var(--space-1)" }}>
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <div className="caption">{description}</div> : null}
        </div>
        <div className="chips">
          <fieldset className="segmented">
            <legend className="sr-only">Вид: {title}</legend>
            <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
              Диаграмма
            </button>
            <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>
              Таблица
            </button>
          </fieldset>
          {csvHref ? <CsvLink href={csvHref} title={title} /> : null}
        </div>
      </div>
      {controls}
      <div hidden={view !== "chart"}>{chart}</div>
      <div hidden={view !== "table"}>{table}</div>
    </section>
  );
}
