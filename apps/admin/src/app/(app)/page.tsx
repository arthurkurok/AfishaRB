/**
 * «Пульс культуры» — дашборд министерства (docs/03-functional-spec.md §9): предложение, спрос,
 * «спрос без предложения», качество данных, здоровье источников и очереди модерации. Каждая таблица — в CSV.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarList } from "@/components/charts/bar-list";
import { ChartCard } from "@/components/charts/chart-card";
import { QualityTable } from "@/components/pulse/quality-table";
import { SupplyChart } from "@/components/pulse/supply-chart";
import { Icon } from "@/components/ui/icons";
import { SectionCard } from "@/components/ui/section-card";
import { StatRow, StatTile } from "@/components/ui/stat-tile";
import { TableWrap } from "@/components/ui/table-wrap";
import { getDashboard } from "@/lib/admin-api";
import { REGION_TZ, SITE_URL } from "@/lib/config";
import { ago, formatStamp } from "@/lib/datetime";
import { categoryLabel, taskKindLabel } from "@/lib/labels";
import {
  categoriesText,
  DESERT_THRESHOLD,
  formatNumber,
  formatPercent,
  PERIODS,
  parsePeriod,
  printable,
  share,
  sourceHealth,
  sourceStatsText,
} from "@/lib/pulse";
import { requireSession } from "@/lib/session";
import styles from "./pulse.module.css";

export const metadata: Metadata = { title: "Пульс культуры" };

const HEALTH_ICON = { ok: "check", stale: "alert", failing: "alert", manual: "info" } as const;

export default async function PulsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const session = await requireSession("/");
  if (session.role !== "ministry") redirect("/cabinet");
  const days = parsePeriod((await searchParams).days);
  const d = await getDashboard(days, `/?days=${days}`);
  const csv = (table: string) => `/pulse/export/${table}?days=${days}`;
  const now = new Date();
  const zeroShare = share(d.totals.zero_results, d.totals.searches);
  const openTasks = d.moderation.reduce((sum, m) => sum + m.open, 0);
  const coverage = share(d.totals.municipalities_covered, d.totals.municipalities_total);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Пульс культуры</h1>
          <p className="muted">
            Афиша Башкортостана: предложение на {days} дн. вперёд, спрос жителей за {days} дн. назад. Данные на{" "}
            {formatStamp(now.toISOString(), REGION_TZ)}.
          </p>
        </div>
        <nav aria-label="Период" className="segmented">
          {PERIODS.map((p) => (
            <Link key={p} href={`/?days=${p}`} aria-current={p === days ? "page" : undefined}>
              {p} дней
            </Link>
          ))}
        </nav>
      </div>

      <StatRow label="Ключевые показатели">
        <StatTile label="Событий в афише" value={formatNumber(d.totals.events)} note="предстоящих, опубликованных" />
        <StatTile
          label="Сеансов впереди"
          value={formatNumber(d.totals.occurrences)}
          note="по плану, распроданных и уточняемых"
        />
        <StatTile
          label="Охват муниципалитетов"
          value={`${d.totals.municipalities_covered} из ${d.totals.municipalities_total}`}
          meter={coverage}
          note={`есть сеансы в ближайшие ${days} дн.`}
        />
        <StatTile
          label="Поисковых запросов"
          value={formatNumber(d.totals.searches)}
          note={`без результата: ${formatNumber(d.totals.zero_results)} (${formatPercent(zeroShare)})`}
        />
        <StatTile label="Диалогов с Гидом" value={formatNumber(d.totals.assistant_dialogs)} note={`за ${days} дн.`} />
        <StatTile
          label="Задач модерации"
          value={formatNumber(openTasks)}
          note="открыто — перейти к очереди"
          href="/moderation"
        />
      </StatRow>

      <SectionCard
        id="gaps"
        emphasis
        title="Спрос без предложения"
        description={
          <>
            Что жители искали за {days} дн. и не нашли ни одного события — по месту и теме. Основание для гастрольного
            плана, госзадания и работы с учреждениями.
          </>
        }
        csvHref={csv("demand-gaps")}
      >
        {d.demand_without_supply.length === 0 ? (
          <p className="notice notice--ok" role="status">
            <Icon name="check" /> За {days} дн. нет запросов с пустой выдачей.
          </p>
        ) : (
          <TableWrap label="Таблица: спрос без предложения">
            <table className="table">
              <caption className="sr-only">Спрос без предложения за {days} дн.</caption>
              <thead>
                <tr>
                  <th scope="col">Где</th>
                  <th scope="col">Что искали</th>
                  <th scope="col">С детьми</th>
                  <th scope="col" className="num">
                    Запросов без результата
                  </th>
                  <th scope="col">Пример запроса</th>
                </tr>
              </thead>
              <tbody>
                {d.demand_without_supply.map((g) => (
                  <tr key={`${g.municipality}|${g.categories}|${g.with_kids}`}>
                    <th scope="row" style={{ fontWeight: 600 }}>
                      {g.municipality ?? "вся республика"}
                    </th>
                    <td>{categoriesText(g.categories)}</td>
                    <td>{g.with_kids ? "да" : "нет"}</td>
                    <td className="num">
                      <strong>{formatNumber(g.n)}</strong>
                    </td>
                    <td className={styles.query}>{g.example ? `«${printable(g.example)}»` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </SectionCard>

      <div className="grid-2">
        <SectionCard
          id="deserts"
          title="Культурные пустыни"
          description={`Муниципалитеты, где на ближайшие ${days} дн. меньше ${DESERT_THRESHOLD} сеансов.`}
          csvHref={csv("deserts")}
        >
          {d.culture_deserts.length === 0 ? (
            <p className="notice notice--ok" role="status">
              <Icon name="check" /> Культурных пустынь нет: во всех {d.totals.municipalities_total} муниципалитетах есть
              хотя бы {DESERT_THRESHOLD} сеанса.
            </p>
          ) : (
            <ul className={styles.deserts}>
              {d.culture_deserts.map((m) => (
                <li key={m.id}>
                  <Icon name="alert" size={18} />
                  <a href={`${SITE_URL}/m/${encodeURIComponent(m.id)}`} target="_blank" rel="noreferrer">
                    {m.name}
                  </a>
                  <span className="num">
                    {m.upcoming === 0 ? "нет сеансов" : `${m.upcoming} ${m.upcoming === 1 ? "сеанс" : "сеанса"}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <ChartCard
          title="Сеансы по категориям"
          description={`На ближайшие ${days} дн. Событие может относиться к нескольким категориям.`}
          csvHref={csv("categories")}
          chart={
            <BarList
              label={`Сеансы по категориям на ${days} дн.`}
              items={d.by_category.map((c) => ({ key: c.code, label: categoryLabel(c.code), value: c.n }))}
            />
          }
          table={
            <TableWrap label="Таблица: сеансы по категориям">
              <table className="table">
                <caption className="sr-only">Сеансы по категориям</caption>
                <thead>
                  <tr>
                    <th scope="col">Категория</th>
                    <th scope="col" className="num">
                      Сеансов
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.by_category.map((c) => (
                    <tr key={c.code}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        {categoryLabel(c.code)}
                      </th>
                      <td className="num">{formatNumber(c.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          }
        />
      </div>

      <SupplyChart rows={d.supply} days={days} threshold={DESERT_THRESHOLD} csvHref={csv("supply")} />

      <div className="grid-2">
        <SectionCard
          id="queries"
          title="Топ запросов"
          description={`Чаще всего искали за ${days} дн. (поиск на сайте, в боте и в приложениях, обезличенно).`}
          csvHref={csv("queries")}
        >
          {d.demand_top.length === 0 ? (
            <p className="muted">Запросов за период нет.</p>
          ) : (
            <TableWrap label="Таблица: топ запросов">
              <table className="table">
                <caption className="sr-only">Топ запросов за {days} дн.</caption>
                <thead>
                  <tr>
                    <th scope="col">Запрос</th>
                    <th scope="col" className="num">
                      Раз
                    </th>
                    <th scope="col" className="num">
                      Найдено в среднем
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.demand_top.map((q) => (
                    <tr key={q.query}>
                      <th scope="row" className={styles.query} style={{ fontWeight: 500 }}>
                        {printable(q.query)}
                      </th>
                      <td className="num">{formatNumber(q.n)}</td>
                      <td className="num">
                        {q.avg_results === 0 ? (
                          <span className={styles.zero}>
                            <Icon name="alert" size={14} /> 0 — ничего
                          </span>
                        ) : (
                          formatNumber(q.avg_results ?? 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </SectionCard>

        <SectionCard
          id="sources"
          title="Здоровье источников"
          description="Последний успешный сбор и его итог по каждому источнику данных."
          csvHref={csv("sources")}
        >
          <ul className={styles.sources}>
            {d.sources.map((s) => {
              const h = sourceHealth(s, now);
              return (
                <li key={s.id}>
                  <div className={styles.sourceHead}>
                    <strong>{s.title}</strong>
                    <span className={styles.health} data-kind={h.kind}>
                      <Icon name={HEALTH_ICON[h.kind]} size={16} />
                      {h.label}
                    </span>
                  </div>
                  <p className="caption">
                    {s.last_success_at
                      ? `Сбор: ${formatStamp(s.last_success_at, REGION_TZ)} (${ago(s.last_success_at, now)})`
                      : "Успешных сборов не было"}
                  </p>
                  <p className="caption">{sourceStatsText(s.last_stats)}</p>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        id="quality"
        title="Качество данных учреждений"
        description="Индекс полноты карточек 0–100 (фото, описание, цена, билеты, доступность, адрес). Сначала — учреждения с самым низким индексом; название открывает кабинет учреждения."
        csvHref={csv("quality")}
      >
        {d.data_quality.length === 0 ? <p className="muted">Нет данных.</p> : <QualityTable rows={d.data_quality} />}
      </SectionCard>

      <SectionCard
        id="moderation"
        title="Очереди модерации"
        description="Открытые задачи модераторов министерства."
        csvHref={csv("moderation")}
      >
        <div className={styles.queues}>
          {d.moderation.length === 0 ? (
            <p className="notice notice--ok" role="status">
              <Icon name="check" /> Очереди пусты.
            </p>
          ) : (
            d.moderation.map((m) => (
              <StatTile
                key={m.kind}
                label={taskKindLabel(m.kind)}
                value={formatNumber(m.open)}
                note="открыть очередь"
                href={`/moderation?kind=${encodeURIComponent(m.kind)}`}
              />
            ))
          )}
          <StatTile
            label="Жалобы и обратная связь"
            value="→"
            note="неточности и правки перевода"
            href="/moderation/reports"
          />
        </div>
      </SectionCard>
    </>
  );
}
