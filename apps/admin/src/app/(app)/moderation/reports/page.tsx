/**
 * Жалобы пользователей «неверная информация» и обратная связь, в том числе правки башкирского перевода
 * (POST /v1/reports, POST /v1/feedback → GET /admin/reports). Только чтение: API пока не умеет закрывать жалобы.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModerationTabs } from "@/components/moderation/moderation-tabs";
import { Icon } from "@/components/ui/icons";
import { listReports } from "@/lib/admin-api";
import type { ReportRow } from "@/lib/admin-types";
import { REGION_TZ, siteEventUrl } from "@/lib/config";
import { ago, formatStamp } from "@/lib/datetime";
import { CHANNEL_LABEL, isFeedback, reportReasonLabel } from "@/lib/labels";
import { requireSession } from "@/lib/session";
import styles from "../moderation.module.css";

export const metadata: Metadata = { title: "Жалобы и обратная связь" };

const FILTERS = {
  all: { label: "Все", test: () => true },
  reports: { label: "Жалобы на события", test: (r: ReportRow) => !isFeedback(r.reason) },
  translation: { label: "Правки перевода", test: (r: ReportRow) => r.reason === "feedback_translation" },
  feedback: {
    label: "Другая обратная связь",
    test: (r: ReportRow) => isFeedback(r.reason) && r.reason !== "feedback_translation",
  },
} as const;
type Filter = keyof typeof FILTERS;

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const session = await requireSession("/moderation/reports");
  if (session.role !== "ministry") redirect("/cabinet");
  const sp = await searchParams;
  const filter: Filter = typeof sp.type === "string" && sp.type in FILTERS ? (sp.type as Filter) : "all";
  const all = await listReports();
  const items = all.filter(FILTERS[filter].test);
  const now = new Date();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Жалобы и обратная связь</h1>
          <p className="muted">
            Сообщения жителей о неточностях и предложения правок перевода. Последние 200, новые сверху.
          </p>
        </div>
      </div>
      <ModerationTabs current="reports" />
      <nav aria-label="Тип сообщений" className="chips">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/moderation/reports" : `/moderation/reports?type=${f}`}
            className="chip"
            aria-current={filter === f ? "page" : undefined}
          >
            {FILTERS[f].label} ({all.filter(FILTERS[f].test).length})
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="card stack" role="status">
          <h2>
            <Icon name="check" size={24} /> Сообщений нет
          </h2>
          <p className="muted">
            {filter === "all"
              ? "Жители пока не сообщали о неточностях. Кнопка «Сообщить о неточности» есть в каждом паспорте события, «Предложить правку перевода» — в разделе «О проекте» на башкирском."
              : "В этой категории сообщений нет."}
          </p>
        </div>
      ) : (
        <ul className={styles.reports} aria-label="Сообщения">
          {items.map((r) => {
            const ctx = r.context ?? {};
            const original = text(ctx.original);
            const suggestion = text(ctx.suggestion);
            const page = text(ctx.page);
            return (
              <li key={r.id} className={`card ${styles.report}`}>
                <div className={styles.reportHead}>
                  <span className={styles.kind}>
                    <Icon name={isFeedback(r.reason) ? "info" : "alert"} size={18} />
                    {reportReasonLabel(r.reason)}
                  </span>
                  <span className="chip">{CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                  {text(ctx.lang) ? <span className="chip">язык: {text(ctx.lang)}</span> : null}
                  <span className="caption">
                    <time dateTime={r.created_at}>{formatStamp(r.created_at, REGION_TZ)}</time> ·{" "}
                    {ago(r.created_at, now)}
                  </span>
                </div>
                {r.event_id ? (
                  <p>
                    Событие:{" "}
                    <a href={siteEventUrl(r.event_id)} target="_blank" rel="noreferrer">
                      {r.title ?? "без названия"}
                      <span className="sr-only"> (откроется в новой вкладке)</span>
                    </a>
                  </p>
                ) : null}
                {r.comment ? <p>{r.comment}</p> : null}
                {original || suggestion ? (
                  <dl className={styles.translation}>
                    <div>
                      <dt>Было</dt>
                      <dd lang="ba">{original ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Предлагают</dt>
                      <dd lang="ba">{suggestion ?? "—"}</dd>
                    </div>
                  </dl>
                ) : null}
                {page ? <p className="caption">Страница: {page}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
