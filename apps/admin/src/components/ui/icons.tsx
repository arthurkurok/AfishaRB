/**
 * Линейные иконки 24 px, штрих 2 px (07-design §8). Декоративные: смысл всегда передаёт текст рядом.
 */
import type { BadgeKind } from "@/lib/labels";

const SHAPES: Record<BadgeKind, string> = {
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

/** Формы статус-бейджей (07-design §4.3): статус никогда не передаётся только цветом. */
export function StatusIcon({ kind, size = 16 }: { kind: BadgeKind; size?: number }) {
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

export type IconName =
  | "pulse"
  | "cabinet"
  | "moderation"
  | "download"
  | "external"
  | "plus"
  | "alert"
  | "check"
  | "info"
  | "logout"
  | "search"
  | "sparkle"
  | "arrow-right"
  | "sort"
  | "sort-asc"
  | "sort-desc";

const ICONS: Record<IconName, string> = {
  pulse: "M3 12h4l2.5-6 4 12 2.5-6H21",
  cabinet: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M3 21h18",
  moderation: "M12 3l9 9-9 9-9-9zM8.5 12l2.5 2.5 4.5-5",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  plus: "M12 5v14M5 12h14",
  alert: "M12 3l9 9-9 9-9-9zM12 8v5M12 16v.1",
  check: "M5 12.5l4.5 4.5L19 7.5",
  info: "M12 3l9 9-9 9-9-9zM12 11v5M12 8v.1",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20",
  sparkle: "M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  sort: "M8 10l4-4 4 4M8 14l4 4 4-4",
  "sort-asc": "M8 14l4-4 4 4",
  "sort-desc": "M8 10l4 4 4-4",
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
