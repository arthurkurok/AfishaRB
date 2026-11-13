/**
 * Формы статус-бейджей (07-design §4.3): статус никогда не передаётся только цветом —
 * у каждого своя форма и всегда есть текст.
 */
import type { StatusKind } from "@/lib/format";

const SHAPES: Record<StatusKind, string> = {
  // ромб + стрелка
  rescheduled: "M12 3l9 9-9 9-9-9zM8 12h7M12.5 9l3 3-3 3",
  postponed: "M12 3l9 9-9 9-9-9zM8 12h7M12.5 9l3 3-3 3",
  // перечёркнутый ромб
  cancelled: "M12 3l9 9-9 9-9-9zM6 6l12 12",
  // пустой ромб
  sold_out: "M12 3l9 9-9 9-9-9z",
  ended: "M12 3l9 9-9 9-9-9z",
  // капля мёда
  few_left: "M12 3c4 5 6.5 8.2 6.5 11.2a6.5 6.5 0 0 1-13 0C5.5 11.2 8 8 12 3z",
  // ромб с точкой
  unverified: "M12 3l9 9-9 9-9-9zM12 11.2v.1",
};

export function StatusIcon({ kind, size = 16 }: { kind: StatusKind; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={kind === "unverified" ? 2.4 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SHAPES[kind]} />
      {kind === "unverified" ? <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /> : null}
    </svg>
  );
}
