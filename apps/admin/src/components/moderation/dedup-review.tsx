"use client";
/**
 * Задача «возможные дубли» бок о бок (03-functional-spec §8): названия, оценка сходства, причины скоринга,
 * сравнение полей с подсветкой расхождений, ссылки на обе карточки и решение: «Объединить» / «Это разные события» /
 * «Отложить». Горячие клавиши 1 / 2 / 3 и стрелки; цифровые можно выключить (WCAG 2.1.4).
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icons";
import { TableWrap } from "@/components/ui/table-wrap";
import { resolveTask } from "@/lib/actions/moderation";
import type { ModerationAction } from "@/lib/admin-types";
import type { CompareRow } from "@/lib/moderation";
import styles from "./dedup-review.module.css";

const HOTKEYS_KEY = "afisha.admin.hotkeys";

export interface DedupTaskView {
  id: string;
  score: number | null;
  reasons: string[];
  titleA: string;
  titleB: string;
  urlA: string | null;
  urlB: string | null;
}

export function DedupReview({
  task,
  rows,
  position,
  total,
  prevHref,
  nextHref,
}: {
  task: DedupTaskView;
  rows: CompareRow[] | null;
  position: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmMerge, setConfirmMerge] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [hotkeys, setHotkeys] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const mergeRef = useRef<HTMLButtonElement>(null);
  const firstTask = useRef(task.id);

  useEffect(() => {
    try {
      setHotkeys(window.localStorage.getItem(HOTKEYS_KEY) !== "off");
    } catch {
      /* хранилище недоступно — клавиши включены */
    }
  }, []);

  // Новая задача — фокус на её заголовок, сброс подтверждения.
  useEffect(() => {
    setConfirmMerge(false);
    // При первом открытии страницы фокус не переносим — только при переходе к другой задаче.
    if (firstTask.current !== task.id) {
      firstTask.current = "";
      headingRef.current?.focus();
    }
  }, [task.id]);

  useEffect(() => {
    if (confirmMerge) confirmRef.current?.focus();
  }, [confirmMerge]);

  const decide = useCallback(
    (action: ModerationAction) => {
      startTransition(async () => {
        const res = await resolveTask(task.id, action);
        setResult({ ok: res.ok, text: res.message });
        setConfirmMerge(false);
        // Решение принято или задача уже неактуальна (её закрыли) — к следующей задаче
        if (res.ok || res.stale) {
          if (nextHref) router.push(nextHref);
          else router.refresh();
        }
      });
    },
    [task.id, nextHref, router],
  );

  const skip = useCallback(() => {
    setResult({ ok: true, text: `Задача «${task.titleA}» отложена — она останется в очереди.` });
    if (nextHref) router.push(nextHref);
  }, [nextHref, router, task.titleA]);

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
      if (!hotkeys) return;
      if (e.key === "1") {
        e.preventDefault();
        setConfirmMerge(true);
      } else if (e.key === "2") {
        e.preventDefault();
        decide("distinct");
      } else if (e.key === "3") {
        e.preventDefault();
        skip();
      } else if (e.key === "Escape" && confirmMerge) {
        setConfirmMerge(false);
        mergeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hotkeys, pending, nextHref, prevHref, confirmMerge, decide, skip, router]);

  const toggleHotkeys = (on: boolean) => {
    setHotkeys(on);
    try {
      window.localStorage.setItem(HOTKEYS_KEY, on ? "on" : "off");
    } catch {
      /* настройка действует до перезагрузки */
    }
  };

  const scoreText = task.score === null ? "—" : task.score.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

  return (
    <section
      className={`card stack ${styles.task}`}
      aria-labelledby="task-title"
      data-testid="dedup-task"
      aria-busy={pending || undefined}
    >
      <div className={styles.head}>
        <p className="caption">
          Задача {position} из {total} · возможные дубли
        </p>
        <h2 id="task-title" ref={headingRef} tabIndex={-1}>
          Это одно и то же событие?
        </h2>
        <div className="chips">
          <span className={styles.score}>
            Сходство <strong className="num">{scoreText}</strong>
          </span>
          {task.reasons.map((r) => (
            <span key={r} className="chip">
              {r}
            </span>
          ))}
        </div>
      </div>

      <TableWrap label="Сравнение карточек А и Б">
        <table className={`table ${styles.compare}`}>
          <caption className="sr-only">Сравнение карточек А и Б. Отличающиеся поля отмечены.</caption>
          <thead>
            <tr>
              <th scope="col">Поле</th>
              <th scope="col">А — останется</th>
              <th scope="col">Б — скроется при объединении</th>
            </tr>
          </thead>
          <tbody>
            {rows ? (
              rows.map((r) => (
                <tr key={r.key} data-differs={r.differs ? "true" : undefined}>
                  <th scope="row">
                    {r.label}
                    {r.differs ? (
                      <span className={styles.diff}>
                        <Icon name="alert" size={14} />
                        отличается
                      </span>
                    ) : null}
                  </th>
                  <td>{r.a}</td>
                  <td>{r.b}</td>
                </tr>
              ))
            ) : (
              <tr>
                <th scope="row">Название</th>
                <td>{task.titleA}</td>
                <td>{task.titleB}</td>
              </tr>
            )}
            <tr>
              <th scope="row">Карточка</th>
              <td>
                {task.urlA ? (
                  <a href={task.urlA} target="_blank" rel="noreferrer">
                    Паспорт А <Icon name="external" size={14} />
                    <span className="sr-only"> (откроется в новой вкладке)</span>
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {task.urlB ? (
                  <a href={task.urlB} target="_blank" rel="noreferrer">
                    Паспорт Б <Icon name="external" size={14} />
                    <span className="sr-only"> (откроется в новой вкладке)</span>
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      {rows === null ? (
        <p className="caption">
          Подробности карточек недоступны (событие могло быть снято с публикации) — сравните по паспортам.
        </p>
      ) : null}

      {confirmMerge ? (
        <section className={`notice ${styles.confirm}`} aria-labelledby="merge-q">
          <Icon name="alert" />
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <p id="merge-q">
              <strong>Объединить?</strong> Карточка Б будет скрыта и привязана к А; её история изменений сохранится в
              журнале.
            </p>
            <div className="chips">
              <button
                ref={confirmRef}
                type="button"
                className="btn btn--primary"
                onClick={() => decide("merge")}
                disabled={pending}
              >
                Да, объединить
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setConfirmMerge(false);
                  mergeRef.current?.focus();
                }}
              >
                Нет
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <div className={styles.actions}>
        <button
          ref={mergeRef}
          type="button"
          className="btn btn--primary"
          onClick={() => setConfirmMerge(true)}
          disabled={pending}
          aria-keyshortcuts={hotkeys ? "1" : undefined}
        >
          Объединить {hotkeys ? <kbd>1</kbd> : null}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => decide("distinct")}
          disabled={pending}
          aria-keyshortcuts={hotkeys ? "2" : undefined}
        >
          Это разные события {hotkeys ? <kbd>2</kbd> : null}
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
        <label className="check">
          <input type="checkbox" checked={hotkeys} onChange={(e) => toggleHotkeys(e.target.checked)} />
          <span>Горячие клавиши</span>
        </label>
        <p className="caption">
          <kbd>1</kbd> объединить · <kbd>2</kbd> разные · <kbd>3</kbd> отложить · <kbd>←</kbd> <kbd>→</kbd> предыдущая и
          следующая задача
        </p>
      </div>
    </section>
  );
}
