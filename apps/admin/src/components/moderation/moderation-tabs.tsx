import Link from "next/link";

/** Подразделы модерации: очередь задач и жалобы с обратной связью. */
export function ModerationTabs({ current }: { current: "tasks" | "reports" }) {
  return (
    <nav aria-label="Подразделы модерации" className="segmented" style={{ alignSelf: "flex-start" }}>
      <Link href="/moderation" aria-current={current === "tasks" ? "page" : undefined}>
        Очередь задач
      </Link>
      <Link href="/moderation/reports" aria-current={current === "reports" ? "page" : undefined}>
        Жалобы и обратная связь
      </Link>
    </nav>
  );
}
