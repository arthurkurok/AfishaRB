/**
 * Пустое состояние и ошибка (07-design §8, §10): маскот + одна фраза + одно действие.
 */
import type { ReactNode } from "react";
import { Mascot, type MascotEmotion } from "@/brand/mascot";
import styles from "./states.module.css";

export function StateMessage({
  title,
  text,
  action,
  emotion = "not-found",
  role,
  headingLevel = 2,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
  emotion?: MascotEmotion;
  role?: "alert" | "status";
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.state} role={role}>
      <Mascot emotion={emotion} size={120} className={styles.mascot} />
      <div className={styles.text}>
        <Heading className={styles.title}>{title}</Heading>
        {text ? <p className="muted">{text}</p> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
