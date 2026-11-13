import { StatusIcon } from "@/brand/status-icon";
import type { StatusKind } from "@/lib/format";
import styles from "./status-badge.module.css";

/** Статус-бейдж: форма + текст + цвет (07-design §4.3). */
export function StatusBadge({ kind, label, size = "m" }: { kind: StatusKind; label: string; size?: "m" | "l" }) {
  return (
    <span className={`${styles.badge} ${size === "l" ? styles.large : ""}`} data-kind={kind}>
      <StatusIcon kind={kind} size={size === "l" ? 20 : 16} />
      <span>{label}</span>
    </span>
  );
}
