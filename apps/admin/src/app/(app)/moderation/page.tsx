/**
 * Модерация (docs/03-functional-spec.md §8): очередь задач по видам, задача «возможные дубли» бок о бок,
 * решения с горячими клавишами. Доступно роли «Министерство».
 */
import type { EventDetail } from "@afisha/contract";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DedupReview } from "@/components/moderation/dedup-review";
import { ModerationTabs } from "@/components/moderation/moderation-tabs";
import { TaskReview, type TaskReviewView } from "@/components/moderation/task-review";
import { Icon } from "@/components/ui/icons";
import { listModerationTasks, MODERATION_LIMIT } from "@/lib/admin-api";
import { REGION_TZ, siteEventUrl } from "@/lib/config";
import { ago } from "@/lib/datetime";
import { categoryLabel, taskKindLabel } from "@/lib/labels";
import { compareEvents, dedupPayload, neighbours } from "@/lib/moderation";
import { getEvent } from "@/lib/public-api";
import { requireSession } from "@/lib/session";
import { payloadFacts, taskTitle, validationProblems, vanishedView } from "@/lib/task-view";
import styles from "./moderation.module.css";

export const metadata: Metadata = { title: "Модерация" };

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

type Task = Awaited<ReturnType<typeof listModerationTasks>>[number];

/** Карточка задачи любого вида, кроме дублей: человекочитаемые поля вместо payload. */
function taskView(t: Task): TaskReviewView {
  const queuedAgo = ago(t.created_at);
  if (t.kind === "vanished") {
    const { eventId, ...v } = vanishedView(t, REGION_TZ);
    return { variant: "vanished", id: t.id, queuedAgo, ...v, eventUrl: eventId ? siteEventUrl(eventId) : null };
  }
  return {
    variant: "other",
    id: t.id,
    kind: t.kind,
    kindLabel: taskKindLabel(t.kind),
    title: taskTitle(t),
    problems: validationProblems(t.payload),
    facts: payloadFacts(t.payload, REGION_TZ),
    queuedAgo,
  };
}

/** Строка очереди: название события (или вид задачи) и, для исчезнувшего сеанса, его дата. */
function queueLabel(t: Task): string {
  const title = taskTitle(t) ?? taskKindLabel(t.kind);
  if (t.kind === "vanished") {
    const v = vanishedView(t, REGION_TZ);
    return v.when ? `${title} · ${v.when}` : title;
  }
  return t.title_b ? `${title} ↔ ${t.title_b}` : title;
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const session = await requireSession("/moderation");
  if (session.role !== "ministry") redirect("/cabinet");
  const sp = await searchParams;
  const all = await listModerationTasks({}, "/moderation");
  const counts = new Map<string, number>();
  for (const t of all) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  const kind = str(sp.kind) && counts.has(str(sp.kind)) ? str(sp.kind) : "";
  const queue = kind ? all.filter((t) => t.kind === kind) : all;
  const current = queue.find((t) => t.id === str(sp.task)) ?? queue[0] ?? null;
  const href = (taskId: string) => `/moderation?${new URLSearchParams({ ...(kind ? { kind } : {}), task: taskId })}`;

  let rows = null;
  if (current?.kind === "dedup_review" && current.entity_id && current.related_id) {
    const [a, b] = await Promise.all([
      getEvent(current.entity_id).catch(() => null),
      getEvent(current.related_id).catch(() => null),
    ]);
    rows = a && b ? compareEvents(a as EventDetail, b as EventDetail, REGION_TZ, categoryLabel) : null;
  }
  const nb = current
    ? neighbours(
        queue.map((t) => t.id),
        current.id,
      )
    : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Модерация</h1>
          <p className="muted">
            Открытых задач:{" "}
            {all.length >= MODERATION_LIMIT
              ? `не меньше ${MODERATION_LIMIT}, показаны первые ${MODERATION_LIMIT}`
              : all.length}
            . Решения записываются в журнал изменений.
          </p>
        </div>
      </div>
      <ModerationTabs current="tasks" />

      {counts.size > 1 ? (
        <nav aria-label="Виды задач" className="chips">
          <Link href="/moderation" className="chip" aria-current={kind === "" ? "page" : undefined}>
            Все ({all.length})
          </Link>
          {[...counts].map(([k, n]) => (
            <Link
              key={k}
              href={`/moderation?kind=${encodeURIComponent(k)}`}
              className="chip"
              aria-current={kind === k ? "page" : undefined}
            >
              {taskKindLabel(k)} ({n})
            </Link>
          ))}
        </nav>
      ) : null}

      {!current || !nb ? (
        <div className="card stack" role="status">
          <h2>
            <Icon name="check" size={24} /> Очередь пуста
          </h2>
          <p className="muted">Новых задач нет. Дубли из источников появятся здесь после очередной синхронизации.</p>
        </div>
      ) : current.kind === "dedup_review" ? (
        <DedupReview
          task={{
            id: current.id,
            ...dedupPayload(current.payload),
            titleA: current.title_a ?? "Событие А",
            titleB: current.title_b ?? "Событие Б",
            urlA: current.entity_id ? siteEventUrl(current.entity_id) : null,
            urlB: current.related_id ? siteEventUrl(current.related_id) : null,
          }}
          rows={rows}
          position={nb.position}
          total={queue.length}
          prevHref={nb.prev ? href(nb.prev) : null}
          nextHref={nb.next ? href(nb.next) : null}
        />
      ) : (
        <TaskReview
          task={taskView(current)}
          position={nb.position}
          total={queue.length}
          prevHref={nb.prev ? href(nb.prev) : null}
          nextHref={nb.next ? href(nb.next) : null}
        />
      )}

      {queue.length > 1 ? (
        <details className="card">
          <summary className={styles.summary}>Вся очередь ({queue.length})</summary>
          <ol className={styles.queue}>
            {queue.map((t) => {
              const p = dedupPayload(t.payload);
              return (
                <li key={t.id}>
                  <Link href={href(t.id)} aria-current={t.id === current?.id ? "true" : undefined}>
                    {queueLabel(t)}
                  </Link>
                  <span className="caption">
                    {taskKindLabel(t.kind)}
                    {p.score !== null ? ` · сходство ${p.score.toLocaleString("ru-RU")}` : ""} · {ago(t.created_at)}
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      ) : null}
    </>
  );
}
