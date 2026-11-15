/**
 * Пустое состояние и ошибка (07-design §8, §10): одна фраза + одно действие.
 * Маскот убран (ADR-017): поле emotion сохранено в интерфейсе для совместимости вызовов.
 */
import type { Translate } from "@afisha/i18n";
import type { ReactNode } from "react";
import { RetryButton } from "./retry-button";
import styles from "./states.module.css";

export function StateMessage({
  title,
  text,
  action,
  emotion: _emotion = "not-found",
  role,
  headingLevel = 2,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  emotion?: string;
  role?: "alert" | "status";
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.state} role={role}>
      <div className={styles.text}>
        <Heading className={styles.title}>{title}</Heading>
        {text ? <p className="muted">{text}</p> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Лента не загрузилась (ошибка или таймаут API) — честное «не получилось» с повтором, а не «Пока пусто»:
 * пустое состояние говорит, что событий нет, и вводит в заблуждение.
 */
export function FeedError({ t, headingLevel = 3 }: { t: Translate; headingLevel?: 2 | 3 }) {
  return (
    <StateMessage
      title={t("state.errorTitle")}
      text={t("state.errorText")}
      emotion="network-error"
      headingLevel={headingLevel}
      action={<RetryButton />}
    />
  );
}
