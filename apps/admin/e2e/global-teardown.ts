/**
 * Уборка после e2e: сеансы всех тестовых событий «[e2e] …» отменяются (из поиска и подборок они уходят сразу),
 * незакрытая тестовая задача модерации закрывается без решения. Реальные события не затрагиваются.
 */
import { existsSync, readFileSync } from "node:fs";
import { ADMIN_TOKEN, API, CREATED_FILE, FIXTURES_FILE, type Fixtures } from "./helpers";

const REASON = "Тестовое событие автотестов (e2e) — снято с публикации";

async function cancelEvent(id: string) {
  const res = await fetch(`${API}/v1/events/${id}`);
  if (!res.ok) return; // скрыто после объединения или не найдено
  const ev = (await res.json()) as { title: string; occurrences: { id: string; status: string }[] };
  if (!ev.title.startsWith("[e2e]")) return; // страховка: чужие события не трогаем
  for (const o of ev.occurrences) {
    if (["cancelled", "ended", "rescheduled"].includes(o.status)) continue;
    await fetch(`${API}/admin/occurrences/${o.id}/status`, {
      method: "POST",
      headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled", reason: REASON }),
    });
  }
}

export default async function globalTeardown() {
  if (!existsSync(FIXTURES_FILE)) return;
  const f = JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as Fixtures;
  const created = existsSync(CREATED_FILE) ? (JSON.parse(readFileSync(CREATED_FILE, "utf8")) as string[]) : [];
  for (const id of [f.cabinetEvent.id, f.dedup.a, f.dedup.b, ...created]) await cancelEvent(id).catch(() => undefined);
  if (f.dedup.taskId) {
    const tasks = (await fetch(`${API}/admin/moderation/tasks?kind=dedup_review&state=open`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    }).then((r) => r.json())) as { id: string }[];
    if (tasks.some((t) => t.id === f.dedup.taskId)) {
      await fetch(`${API}/admin/moderation/tasks/${f.dedup.taskId}/resolve`, {
        method: "POST",
        headers: { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
    }
  }
}
