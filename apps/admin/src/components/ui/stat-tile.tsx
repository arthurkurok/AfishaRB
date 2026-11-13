/**
 * Плитка показателя (dataviz: stat tile): подпись, значение (пропорциональные цифры), пояснение.
 * Необязательный «метр» — доля от целого на дорожке; значение всегда написано текстом.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./stat-tile.module.css";

export function StatTile({
  label,
  value,
  note,
  meter,
  href,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Доля 0…1 для дорожки под значением */
  meter?: number | null;
  href?: string;
}) {
  const body = (
    <>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      {typeof meter === "number" ? (
        <span className={styles.meter} aria-hidden="true">
          <span style={{ inlineSize: `${Math.max(0, Math.min(1, meter)) * 100}%` }} />
        </span>
      ) : null}
      {note ? <span className={styles.note}>{note}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className={`${styles.tile} ${styles.link}`}>
      {body}
    </Link>
  ) : (
    <div className={styles.tile}>{body}</div>
  );
}

export function StatRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className={styles.row}>
      {children}
    </section>
  );
}
