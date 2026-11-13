"use client";
/**
 * «Качество данных учреждений»: сортируемая таблица, по умолчанию низкие индексы сверху.
 * Индекс — число и уровень словом; полоска-метр лишь дублирует число (статус не только цветом).
 */
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { TableWrap } from "@/components/ui/table-wrap";
import type { DataQualityRow } from "@/lib/admin-types";
import { QUALITY_LEVEL_LABEL, type QualitySortKey, qualityLevel, type SortDir, sortQuality } from "@/lib/quality";
import styles from "./quality-table.module.css";

const COLUMNS: { key: QualitySortKey; label: string; num: boolean }[] = [
  { key: "name", label: "Учреждение", num: false },
  { key: "events", label: "Событий", num: true },
  { key: "avg_quality", label: "Индекс полноты", num: true },
  { key: "no_image", label: "Без фото", num: true },
  { key: "no_price", label: "Без цены", num: true },
];

export function QualityTable({ rows }: { rows: DataQualityRow[] }) {
  const [sort, setSort] = useState<{ key: QualitySortKey; dir: SortDir }>({ key: "avg_quality", dir: "asc" });
  const sorted = sortQuality(rows, sort.key, sort.dir);

  const toggle = (key: QualitySortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <TableWrap label="Таблица: качество данных учреждений">
      <table className="table">
        <caption className="sr-only">
          Качество данных учреждений. Сортировка: {COLUMNS.find((c) => c.key === sort.key)?.label},{" "}
          {sort.dir === "asc" ? "по возрастанию" : "по убыванию"}.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.num ? "num" : undefined}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label}
                    <Icon name={active ? (sort.dir === "asc" ? "sort-asc" : "sort-desc") : "sort"} size={16} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const score = r.avg_quality;
            const level = score === null ? null : qualityLevel(score);
            return (
              <tr key={r.id}>
                <th scope="row" style={{ fontWeight: 500 }}>
                  <Link href={`/cabinet?org=${encodeURIComponent(r.id)}`}>{r.name}</Link>
                </th>
                <td className="num">{r.events}</td>
                <td className="num">
                  {score === null || level === null ? (
                    "нет данных"
                  ) : (
                    <span className={styles.index}>
                      <span className={styles.meter} data-level={level} aria-hidden="true">
                        <span style={{ inlineSize: `${score}%` }} />
                      </span>
                      <span>
                        <strong>{score}</strong> <span className="caption">{QUALITY_LEVEL_LABEL[level]}</span>
                      </span>
                    </span>
                  )}
                </td>
                <td className="num">{r.no_image}</td>
                <td className="num">{r.no_price}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
