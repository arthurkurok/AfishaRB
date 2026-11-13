import styles from "./date-rhombus.module.css";

/**
 * Дата в ромбе (07-design §6–7): день крупно, месяц и время мелко. Декоративна для скринридера —
 * дата полностью озвучивается в ссылке карточки. Отменённый сеанс — ромб перечёркнут.
 */
export function DateRhombus({
  top,
  day,
  bottom,
  crossed = false,
  className = "",
  size = "m",
}: {
  top: string;
  day: string;
  bottom?: string;
  crossed?: boolean;
  className?: string;
  size?: "m" | "l";
}) {
  return (
    <div
      className={`${styles.rhombus} ${size === "l" ? styles.large : ""} ${className}`}
      data-crossed={crossed || undefined}
      aria-hidden="true"
    >
      <span className={styles.month}>{top}</span>
      <span className={styles.day}>{day}</span>
      {bottom ? <span className={styles.note}>{bottom}</span> : null}
    </div>
  );
}
