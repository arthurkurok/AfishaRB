import type { BadgeKind } from "@/lib/labels";
import { Icon, StatusIcon } from "./icons";
import styles from "./status-badge.module.css";

/** Статус-бейдж сеанса: форма + текст + цвет (07-design §4.3). «По плану» — зелёная галочка с текстом. */
export function StatusBadge({ kind, label }: { kind: BadgeKind | "scheduled"; label: string }) {
  return (
    <span className={styles.badge} data-kind={kind}>
      {kind === "scheduled" ? <Icon name="check" size={16} /> : <StatusIcon kind={kind} size={16} />}
      <span>{label}</span>
    </span>
  );
}
