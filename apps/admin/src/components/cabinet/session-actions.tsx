"use client";
/**
 * Действия над сеансом: «Отменить» (с обязательной причиной), «Перенести» (дата и время по Уфе),
 * «Распродано», «Вернуть по плану». Один общий модальный диалог (<dialog>: фокус внутри, Esc закрывает),
 * подтверждение с предупреждением «Подписчики получат уведомление», итог — в живой области над списком.
 */
import { useRouter } from "next/navigation";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Icon } from "@/components/ui/icons";
import { changeSessionStatus } from "@/lib/actions/cabinet";
import { isoToZonedInputs } from "@/lib/datetime";
import { ACTION_LABEL, buildStatusBody, dialogTitle, type SessionAction } from "@/lib/status";
import styles from "./session-actions.module.css";

export interface SessionRef {
  id: string;
  title: string;
  when: string;
  venue: string | null;
  startsAt: string;
}

interface Ctx {
  open: (session: SessionRef, action: SessionAction, opener: HTMLButtonElement) => void;
}

const ActionsContext = createContext<Ctx | null>(null);

const CONFIRM_LABEL: Record<SessionAction, string> = {
  cancel: "Отменить сеанс",
  reschedule: "Перенести",
  sold_out: "Отметить «Билетов нет»",
  restore: "Вернуть по плану",
};

export function SessionActionsProvider({
  tz,
  tzLabel,
  children,
}: {
  tz: string;
  tzLabel: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<{ session: SessionRef; action: SessionAction } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; ok: boolean } | null>(null);
  const [dateUnknown, setDateUnknown] = useState(false);
  const [pending, startTransition] = useTransition();
  const uid = useId();

  const open = useCallback<Ctx["open"]>((session, action, opener) => {
    openerRef.current = opener;
    setTarget({ session, action });
    setErrors({});
    setFailure(null);
    setDateUnknown(false);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (target && dialog && !dialog.open) dialog.showModal();
  }, [target]);

  const close = () => {
    dialogRef.current?.close();
  };

  const onClosed = () => {
    setTarget(null);
    // Возвращаем фокус туда, откуда открыли; если кнопки уже нет (статус сменился) — на сообщение об итоге.
    const opener = openerRef.current;
    if (opener?.isConnected) opener.focus();
    else statusRef.current?.focus();
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target) return;
    const data = new FormData(e.currentTarget);
    const input = {
      reason: String(data.get("reason") ?? ""),
      date: String(data.get("date") ?? ""),
      time: String(data.get("time") ?? ""),
      dateUnknown: data.get("dateUnknown") === "on",
    };
    const local = buildStatusBody(target.action, input, tz);
    if (!local.ok) {
      setErrors(local.errors);
      const first = Object.keys(local.errors)[0];
      if (first) e.currentTarget.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const { session, action } = target;
    startTransition(async () => {
      const res = await changeSessionStatus(session.id, action, input);
      if (res.ok) {
        setDone({ ok: true, text: `«${session.title}», ${session.when}: ${res.message}` });
        openerRef.current = null;
        close();
        router.refresh();
      } else if (res.errors) {
        setErrors(res.errors);
      } else {
        setFailure(res.message ?? "Не удалось изменить статус");
      }
    });
  };

  const ctx = useMemo(() => ({ open }), [open]);
  const action = target?.action;
  const initial = target ? isoToZonedInputs(target.session.startsAt, tz) : null;
  const err = (name: string) =>
    errors[name] ? (
      <p id={`${uid}-${name}-err`} className="field-error">
        <Icon name="alert" size={16} />
        {errors[name]}
      </p>
    ) : null;
  const described = (name: string, hint?: string) =>
    [errors[name] ? `${uid}-${name}-err` : null, hint ?? null].filter(Boolean).join(" ") || undefined;

  return (
    <ActionsContext.Provider value={ctx}>
      <div ref={statusRef} tabIndex={-1} role="status" aria-live="polite" className={styles.live}>
        {done ? (
          <p className={`notice ${done.ok ? "notice--ok" : "notice--error"}`}>
            <Icon name={done.ok ? "check" : "alert"} />
            <span>{done.text}</span>
          </p>
        ) : null}
      </div>
      {children}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-context`}
        onClose={onClosed}
      >
        {target && action ? (
          <form onSubmit={submit} noValidate className={styles.form}>
            <h2 id={`${uid}-title`}>{dialogTitle(action)}</h2>
            <p id={`${uid}-context`} className={styles.context}>
              <strong>{target.session.title}</strong>
              <span>
                {target.session.when}
                {target.session.venue ? ` · ${target.session.venue}` : ""}
              </span>
            </p>

            {action === "cancel" ? (
              <div className="field">
                <label htmlFor={`${uid}-reason`}>Причина отмены — её увидят подписчики</label>
                <textarea
                  id={`${uid}-reason`}
                  name="reason"
                  className="textarea"
                  required
                  maxLength={300}
                  aria-invalid={errors.reason ? true : undefined}
                  aria-describedby={described("reason")}
                  placeholder="Например: болезнь исполнителя главной роли. Билеты принимает касса."
                />
                {err("reason")}
              </div>
            ) : null}

            {action === "reschedule" ? (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    name="dateUnknown"
                    checked={dateUnknown}
                    onChange={(e) => setDateUnknown(e.target.checked)}
                  />
                  <span>Новая дата пока неизвестна — «Перенесено, новая дата уточняется»</span>
                </label>
                {dateUnknown ? null : (
                  <div className={styles.row2}>
                    <div className="field">
                      <label htmlFor={`${uid}-date`}>Новая дата</label>
                      <input
                        id={`${uid}-date`}
                        name="date"
                        type="date"
                        className="input"
                        required
                        defaultValue={initial?.date}
                        aria-invalid={errors.date ? true : undefined}
                        aria-describedby={described("date")}
                      />
                      {err("date")}
                    </div>
                    <div className="field">
                      <label htmlFor={`${uid}-time`}>Время ({tzLabel})</label>
                      <input
                        id={`${uid}-time`}
                        name="time"
                        type="time"
                        className="input"
                        required
                        step={300}
                        defaultValue={initial?.time}
                        aria-invalid={errors.time ? true : undefined}
                        aria-describedby={described("time", `${uid}-tz`)}
                      />
                      <p id={`${uid}-tz`} className="field-hint">
                        Время вводится по часовому поясу региона, а не вашего компьютера.
                      </p>
                      {err("time")}
                    </div>
                  </div>
                )}
                <div className="field">
                  <label htmlFor={`${uid}-reason`}>Причина переноса (необязательно)</label>
                  <textarea
                    id={`${uid}-reason`}
                    name="reason"
                    className="textarea"
                    maxLength={300}
                    aria-invalid={errors.reason ? true : undefined}
                    aria-describedby={described("reason")}
                  />
                  {err("reason")}
                </div>
              </>
            ) : null}

            {action === "sold_out" ? (
              <p>Сеанс останется в афише с бейджем «Билетов нет» и опустится ниже доступных.</p>
            ) : null}
            {action === "restore" ? <p>Сеанс вернётся в афишу и поиск со статусом «по плану».</p> : null}

            <p className="notice">
              <Icon name="info" />
              <span>
                <strong>Подписчики получат уведомление</strong> — в Telegram и приложениях в течение нескольких минут.
              </span>
            </p>

            {failure ? (
              <p className="notice notice--error" role="alert">
                <Icon name="alert" />
                <span>{failure}</span>
              </p>
            ) : null}

            <div className={styles.buttons}>
              <button type="button" className="btn btn--secondary" onClick={close} disabled={pending}>
                Не менять
              </button>
              <button
                type="submit"
                className={`btn ${action === "cancel" ? "btn--danger" : "btn--primary"}`}
                disabled={pending}
                aria-busy={pending || undefined}
              >
                {pending ? "Сохраняем…" : CONFIRM_LABEL[action]}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </ActionsContext.Provider>
  );
}

export function SessionActionButtons({ session, actions }: { session: SessionRef; actions: SessionAction[] }) {
  const ctx = useContext(ActionsContext);
  if (!ctx || actions.length === 0) return null;
  return (
    <div className={styles.buttonsRow}>
      {actions.map((a) => (
        <button
          key={a}
          type="button"
          className={`btn btn--small ${a === "cancel" ? "btn--secondary" : a === "restore" ? "btn--primary" : "btn--secondary"}`}
          onClick={(e) => ctx.open(session, a, e.currentTarget)}
          aria-label={`${ACTION_LABEL[a]}: ${session.title}, ${session.when}`}
        >
          {ACTION_LABEL[a]}
        </button>
      ))}
    </div>
  );
}
