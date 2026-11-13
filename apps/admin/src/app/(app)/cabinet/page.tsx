/**
 * Кабинет учреждения (docs/03-functional-spec.md §7): ближайшие сеансы со статусами и действиями
 * «Отменить / Перенести / Распродано / Вернуть по плану», индекс полноты данных и переход к «Новому событию».
 */

import { formatDate } from "@afisha/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrgPicker } from "@/components/cabinet/org-picker";
import { QualityPanel } from "@/components/cabinet/quality-panel";
import { SessionActionsProvider } from "@/components/cabinet/session-actions";
import { SessionList } from "@/components/cabinet/session-list";
import { Icon } from "@/components/ui/icons";
import { CABINET_PERIODS, loadQuality, loadSessions, parseCabinetPeriod } from "@/lib/cabinet";
import { REGION_TZ, REGION_TZ_LABEL } from "@/lib/config";
import { isValidDate, todayIn } from "@/lib/datetime";
import { listOrganizations } from "@/lib/public-api";
import { isUuid, readChosenOrg, requireSession } from "@/lib/session";
import styles from "./cabinet.module.css";

export const metadata: Metadata = { title: "Кабинет учреждения" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CabinetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  await requireSession("/cabinet");
  const sp = await searchParams;
  const chosen = await readChosenOrg();
  const orgParam = str(sp.org);
  const orgId = isUuid(orgParam) ? orgParam : chosen?.id;

  if (sp.change === "1" || !orgId) {
    const oq = str(sp.oq).trim().slice(0, 100);
    const items = await listOrganizations({ q: oq || undefined, limit: 30 });
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Кабинет учреждения</h1>
            <p className="muted">Сеансы и их статусы, новые события, полнота данных — для выбранного учреждения.</p>
          </div>
        </div>
        <OrgPicker q={oq} items={items} current={chosen?.id} />
      </>
    );
  }

  const period = parseCabinetPeriod(str(sp.period));
  const q = str(sp.q).trim().slice(0, 100);
  const today = todayIn(REGION_TZ);
  const from = isValidDate(str(sp.from)) ? str(sp.from) : today;
  const cursor = str(sp.cursor) || undefined;
  const sessions = await loadSessions({ organization: orgId, period, from, q: q || undefined, cursor });
  const orgName = (chosen?.id === orgId ? chosen.name : null) ?? sessions.items[0]?.event.organization ?? "Учреждение";
  const base = `/cabinet?org=${orgId}&period=${period}${from !== today ? `&from=${from}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="caption">Кабинет учреждения</p>
          <h1>{orgName}</h1>
          <p className="muted">
            Сеансы {from === today ? "с сегодняшнего дня" : `с ${formatDate(from, "ru")}`} на {period} дн.
            {q ? ` по запросу «${q}»` : ""}: {sessions.total}. Время — {REGION_TZ_LABEL}.
          </p>
        </div>
        <div className="chips">
          <Link href={`/cabinet/new?org=${orgId}`} className="btn btn--primary">
            <Icon name="plus" size={18} />
            Новое событие
          </Link>
          <Link href="/cabinet?change=1" className="btn btn--secondary">
            Сменить учреждение
          </Link>
        </div>
      </div>

      <div className={styles.layout}>
        <section aria-labelledby="sessions-title" className="stack">
          <h2 id="sessions-title">Ближайшие сеансы</h2>
          <form method="get" action="/cabinet" className={styles.filters} aria-label="Фильтр сеансов">
            <input type="hidden" name="org" value={orgId} />
            <div className="field" style={{ flex: "2 1 220px" }}>
              <label htmlFor="session-q">Название события</label>
              <input id="session-q" name="q" type="search" className="input" defaultValue={q} />
            </div>
            <div className="field" style={{ flex: "1 1 160px" }}>
              <label htmlFor="session-from">С даты</label>
              <input id="session-from" name="from" type="date" className="input" defaultValue={from} />
            </div>
            <div className="field" style={{ flex: "1 1 140px" }}>
              <label htmlFor="session-period">Период</label>
              <select id="session-period" name="period" className="select" defaultValue={String(period)}>
                {CABINET_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p} дней
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn--secondary">
              Показать
            </button>
          </form>

          <SessionActionsProvider tz={REGION_TZ} tzLabel={REGION_TZ_LABEL}>
            {sessions.items.length === 0 ? (
              <div className="card stack">
                <p>
                  {q
                    ? `Сеансов «${q}» на ${period} дн. вперёд нет.`
                    : `На ближайшие ${period} дн. у учреждения нет сеансов в афише.`}
                </p>
                <div>
                  <Link href={`/cabinet/new?org=${orgId}`} className="btn btn--primary">
                    Добавить событие
                  </Link>
                </div>
              </div>
            ) : (
              <SessionList items={sessions.items} tz={REGION_TZ} />
            )}
          </SessionActionsProvider>

          {sessions.next_cursor || cursor ? (
            <nav aria-label="Страницы сеансов" className="chips">
              {cursor ? (
                <Link href={base} className="btn btn--secondary btn--small">
                  ← К ближайшим
                </Link>
              ) : null}
              {sessions.next_cursor ? (
                <Link
                  href={`${base}&cursor=${encodeURIComponent(sessions.next_cursor)}`}
                  className="btn btn--secondary btn--small"
                >
                  Следующие сеансы →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        <aside className={styles.aside} aria-label="Качество данных учреждения">
          <Suspense
            fallback={
              <div className="card" role="status">
                <p className="muted">Считаем полноту данных…</p>
              </div>
            }
          >
            <Quality org={orgId} items={sessions.items} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}

async function Quality({ org, items }: { org: string; items: Parameters<typeof loadQuality>[1] }) {
  const quality = await loadQuality(org, items);
  return <QualityPanel quality={quality} />;
}
