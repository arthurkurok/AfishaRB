"use client";
/**
 * Карточка задачи модерации, кроме «возможных дублей» (03-functional-spec §8).
 * «Исчезнувший сеанс»: название, дата в поясе региона, источник, объяснение и решение — «Подтвердить: идёт по плану»
 * (confirm) / «Отменить сеанс» (cancel, с подтверждением) / «Отложить» (остаётся в очереди) / «Закрыть без решения»
 * (dismiss). Прошедший сеанс подтверждать нечего — только «Закрыть».
 * Остальные виды — замечания и поля задачи подписанным списком (никакого сырого JSON) и «Закрыть задачу».
 * Горячие клавиши — как у дублей: 1 / 2 / 3 и стрелки; цифровые можно выключить (WCAG 2.1.4).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { resolveTask } from "@/lib/actions/moderation";
import type { ModerationAction } from "@/lib/admin-types";
import styles from "./task-review.module.css";

const HOTKEYS_KEY = "afisha.admin.hotkeys";

export type TaskReviewView =
  | {
      variant: "vanished";
      id: string;
      title: string | null;
      when: string | null;
      past: boolean;
      source: string | null;
      /** «Театр кукол, Уфа» */
      place: string | null;
      /** Карточка события на сайте */
      eventUrl: string | null;
      /** Открытых задач «исчезнувший сеанс» у этого события, включая эту */
      groupSize: number;
      queuedAgo: string;
    }
  | {
      variant: "other";
      id: string;
      kind: string;
      kindLabel: string;
      title: string | null;
      problems: { field: string | null; text: string }[];
      facts: { label: string; value: string }[];
      queuedAgo: string;
    };

export function TaskReview({
  task,
  position,
  total,
  prevHref,
  nextHref,
}: {
  task: TaskReviewView;
  position: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  // «Ко всем сеансам события»: решение применяется ко всем открытым задачам этого события (scope = event)
  const [applyAll, setApplyAll] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [hotkeys, setHotkeys] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const firstTask = useRef(task.id);

  const decidable = task.variant === "vanished" && !task.past;
  const groupSize = task.variant === "vanished" ? task.groupSize : 1;
  const many = decidable && applyAll && groupSize > 1;
  // Без названия: у исчезнувшего сеанса — нейтральная подпись, у прочих задач заголовком служит вид задачи.
  const name = task.title ?? (task.variant === "vanished" ? "Событие без названия" : task.kindLabel);

  useEffect(() => {
    try {
      setHotkeys(window.localStorage.getItem(HOTKEYS_KEY) !== "off");
    } catch {
      /* хранилище недоступно — клавиши включены */
    }
  }, []);

  // Новая задача — фокус на её заголовок, сброс подтверждения (как у дублей).
  useEffect(() => {
    setConfirmCancel(false);
    setApplyAll(false);
    if (firstTask.current !== task.id) {
      firstTask.current = "";
      headingRef.current?.focus();
    }
  }, [task.id]);

  useEffect(() => {
    if (confirmCancel) confirmRef.current?.focus();
  }, [confirmCancel]);

  const decide = useCallback(
    (action: ModerationAction) => {
      startTransition(async () => {
        const scope = many && (action === "confirm" || action === "cancel") ? "event" : "task";
        const res = await resolveTask(task.id, action, scope);
        setResult({ ok: res.ok, text: res.message });
        setConfirmCancel(false);
        // Решение принято или задача уже неактуальна (сеанс начался, статус изменили) — к следующей задаче
        if (res.ok || res.stale) {
          if (nextHref) router.push(nextHref);
          else router.refresh();
        }
      });
    },
    [task.id, nextHref, router, many],
  );

  const skip = useCallback(() => {
    setResult({ ok: true, text: `Задача «${name}» отложена — она останется в очереди.` });
    if (nextHref) router.push(nextHref);
  }, [nextHref, router, name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || pending) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight" && nextHref) {
        e.preventDefault();
        skip();
        return;
      }
      if (e.key === "ArrowLeft" && prevHref) {
        e.preventDefault();
        router.push(prevHref);
        return;
      }
      if (!hotkeys || !decidable) return;
      if (e.key === "1") {
        e.preventDefault();
        decide("confirm");
      } else if (e.key === "2") {
        e.preventDefault();
        setConfirmCancel(true);
      } else if (e.key === "3" && nextHref) {
        e.preventDefault();
        skip();
      } else if (e.key === "Escape" && confirmCancel) {
        setConfirmCancel(false);
        cancelRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys, decidable, pending, nextHref, prevHref, confirmCancel, decide, skip, router]);

  const toggleHotkeys = (on: boolean) => {
    setHotkeys(on);
    try {
      window.localStorage.setItem(HOTKEYS_KEY, on ? "on" : "off");
    } catch {
      /* настройка действует до перезагрузки */
    }
  };

  const kindText =
    task.variant === "vanished" ? "сеанс пропал из источника" : task.title ? task.kindLabel.toLowerCase() : null;

  return (
    <section
      className={`card stack ${styles.task}`}
      aria-labelledby="task-title"
      data-testid="moderation-task"
      data-variant={task.variant}
      aria-busy={pending || undefined}
    >
      <div className={styles.head}>
        <p className="caption">
          Задача {position} из {total}
          {kindText ? ` · ${kindText}` : ""}
        </p>
        <h2 id="task-title" ref={headingRef} tabIndex={-1}>
          {name}
        </h2>
      </div>

      {task.variant === "vanished" ? (
        <>
          <dl className={styles.facts}>
            <div>
              <dt>Сеанс</dt>
              <dd>{task.when ? <span className={styles.when}>{task.when}</span> : "дата не указана"}</dd>
            </div>
            {task.place ? (
              <div>
                <dt>Площадка</dt>
                <dd>{task.place}</dd>
              </div>
            ) : null}
            <div>
              <dt>Источник</dt>
              <dd>{task.source ?? "не указан"}</dd>
            </div>
            {task.past ? null : (
              <div>
                <dt>Сейчас на сайте</dt>
                <dd>
                  <StatusBadge kind="unverified" label="Информация уточняется" />
                </dd>
              </div>
            )}
            <div>
              <dt>В очереди</dt>
              <dd>{task.queuedAgo}</dd>
            </div>
          </dl>
          {task.past ? (
            <p className="notice">
              <Icon name="info" />
              <span>
                Сеанс уже прошёл{task.when ? ` (${task.when})` : ""} — подтверждать или отменять нечего. Закройте
                задачу.
              </span>
            </p>
          ) : (
            <p className="notice">
              <Icon name="info" />
              <span>
                Сеанс пропал из источника при последней загрузке, поэтому на сайте он помечен «Информация уточняется».
                Уточните у учреждения и подтвердите, что сеанс идёт по плану, или отмените его.
              </span>
            </p>
          )}
          {task.eventUrl ? (
            <p>
              <a href={task.eventUrl} target="_blank" rel="noreferrer">
                Карточка события на сайте <Icon name="external" size={14} />
                <span className="sr-only"> (откроется в новой вкладке)</span>
              </a>
            </p>
          ) : null}
          {decidable && groupSize > 1 ? (
            <label className="check">
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              <span>Применить решение ко всем сеансам этого события в очереди ({groupSize})</span>
            </label>
          ) : null}
        </>
      ) : (
        <>
          {task.problems.length ? (
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              <h3 className={styles.subhead}>Что не так</h3>
              <ul className={styles.problems}>
                {task.problems.map((p) => (
                  <li key={`${p.field}-${p.text}`}>
                    {p.field ? <strong>{p.field}: </strong> : null}
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <dl className={styles.facts}>
            {task.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
            <div>
              <dt>В очереди</dt>
              <dd>{task.queuedAgo}</dd>
            </div>
          </dl>
          <p className="caption">
            {task.kind === "validation"
              ? "Исправьте данные в источнике или в кабинете учреждения, затем закройте задачу."
              : "Разберитесь по данным задачи и закройте её — отдельного решения для этого вида задач нет."}
          </p>
        </>
      )}

      {confirmCancel ? (
        <section className={`notice ${styles.confirm}`} aria-labelledby="cancel-q">
          <Icon name="alert" />
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <p id="cancel-q">
              <strong>{many ? `Отменить все сеансы события в очереди (${groupSize})?` : "Отменить сеанс?"}</strong> На
              сайте, в боте и в приложениях{" "}
              {many ? "они будут показаны как отменённые" : "он будет показан как отменённый"}. Решение запишется в
              журнал изменений.
            </p>
            <div className="chips">
              <button
                ref={confirmRef}
                type="button"
                className="btn btn--danger"
                onClick={() => decide("cancel")}
                disabled={pending}
              >
                {many ? `Да, отменить все (${groupSize})` : "Да, отменить сеанс"}
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setConfirmCancel(false);
                  cancelRef.current?.focus();
                }}
              >
                Нет
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className={styles.actions}>
        {decidable ? (
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => decide("confirm")}
              disabled={pending}
              aria-keyshortcuts={hotkeys ? "1" : undefined}
            >
              {many ? `Подтвердить все (${groupSize})` : "Подтвердить: идёт по плану"} {hotkeys ? <kbd>1</kbd> : null}
            </button>
            <button
              ref={cancelRef}
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmCancel(true)}
              disabled={pending}
              aria-keyshortcuts={hotkeys ? "2" : undefined}
            >
              {many ? `Отменить все (${groupSize})` : "Отменить сеанс"} {hotkeys ? <kbd>2</kbd> : null}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={skip}
              disabled={pending || !nextHref}
              aria-keyshortcuts={hotkeys ? "3" : undefined}
            >
              Отложить {hotkeys ? <kbd>3</kbd> : null}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => decide("dismiss")}
              disabled={pending}
            >
              Закрыть без решения
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--primary" onClick={() => decide("dismiss")} disabled={pending}>
              {task.variant === "vanished" ? "Закрыть" : "Закрыть задачу"}
            </button>
            <button type="button" className="btn btn--secondary" onClick={skip} disabled={pending || !nextHref}>
              Отложить
            </button>
          </>
        )}
      </div>

      <div role="status" aria-live="polite" className={styles.live}>
        {pending ? <p className="muted">Сохраняем решение…</p> : null}
        {!pending && result ? (
          <p className={`notice ${result.ok ? "notice--ok" : "notice--error"}`}>
            <Icon name={result.ok ? "check" : "alert"} />
            <span>{result.text}</span>
          </p>
        ) : null}
      </div>

      <div className={styles.keys}>
        {decidable ? (
          <label className="check">
            <input type="checkbox" checked={hotkeys} onChange={(e) => toggleHotkeys(e.target.checked)} />
            <span>Горячие клавиши</span>
          </label>
        ) : null}
        <p className="caption">
          {decidable && hotkeys ? (
            <>
              <kbd>1</kbd> подтвердить · <kbd>2</kbd> отменить · <kbd>3</kbd> отложить ·{" "}
            </>
          ) : null}
          <kbd>←</kbd> <kbd>→</kbd> предыдущая и следующая задача
        </p>
      </div>
    </section>
  );
}
