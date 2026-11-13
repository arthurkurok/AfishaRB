"use client";
/** Форма входа: токен уходит в Server Action и дальше только на сервер; ошибки объявляются скринридеру. */
import { useActionState, useEffect, useRef } from "react";
import { type LoginState, login } from "@/lib/actions/auth";
import styles from "./login.module.css";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const tokenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.error) tokenRef.current?.focus();
  }, [state]);

  return (
    <form action={action} className={styles.form} noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="field">
        <label htmlFor="token">Токен доступа</label>
        <input
          ref={tokenRef}
          id="token"
          name="token"
          type="password"
          className="input"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "login-error token-hint" : "token-hint"}
        />
        <p id="token-hint" className="field-hint">
          Токен выдаёт администратор системы. Он хранится только на сервере рабочего места.
        </p>
      </div>
      <fieldset className={styles.roles}>
        <legend>Войти как</legend>
        <label className="check">
          <input type="radio" name="role" value="ministry" defaultChecked />
          <span>
            <strong>Министерство</strong>
            <span className="caption"> — «Пульс культуры», модерация и кабинеты учреждений</span>
          </span>
        </label>
        <label className="check">
          <input type="radio" name="role" value="institution" />
          <span>
            <strong>Учреждение</strong>
            <span className="caption"> — кабинет: сеансы, статусы, новые события</span>
          </span>
        </label>
      </fieldset>
      <div aria-live="assertive" className={styles.live}>
        {state.error ? (
          <p id="login-error" className="field-error" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
      <button type="submit" className="btn btn--primary" disabled={pending}>
        {pending ? "Проверяем токен…" : "Войти"}
      </button>
    </form>
  );
}
