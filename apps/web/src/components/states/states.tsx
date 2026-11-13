/**
 * Пустое состояние и ошибка (07-design §8, §10): одна фраза + одно действие.
 * Маскот убран (ADR-017): поле emotion сохранено в интерфейсе для совместимости вызовов.
 */
import type { ReactNode } from "react";
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
