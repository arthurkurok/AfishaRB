/**
 * Тестовые данные e2e — только свои события «[e2e] …», реальный каталог не трогаем:
 *  1) событие для кабинета (сеанс ночью через 150 дней — вне обычного 30-дневного окна кабинета и без пересечений
 *     с реальной афишей);
 *  2) пара похожих событий для очереди модерации + штатный шаг конвейера `cli dedup`, который ставит пару
 *     в «серую зону» (оценка ≈ 0,87: та же площадка и время, разный возраст) и создаёт задачу dedup_review.
 * Идентификаторы сохраняются в e2e/.fixtures.json, в global-teardown сеансы этих событий отменяются.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADMIN_TOKEN, API, CREATED_FILE, FIXTURES_FILE, type Fixtures } from "./helpers";

const ORG_QUERY = process.env.E2E_ORG_QUERY ?? "театр кукол";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function ufaDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function call<T>(path: string, init: { method?: string; body?: unknown; admin?: boolean } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.admin ? { authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

type Org = { id: string; name: string };
type Card = { id: string; venue: { id: string; name: string } | null };

export default async function globalSetup() {
  const run = String(Date.now());
  const orgs = await call<Org[]>(`/v1/organizations?q=${encodeURIComponent(ORG_QUERY)}&limit=5`);
  const org = orgs[0] ?? (await call<Org[]>("/v1/organizations?limit=1"))[0];
  if (!org) throw new Error("В API нет учреждений для e2e");
  const cards = await call<{ items: Card[] }>(
    `/v1/occurrences?organization=${org.id}&group=false&include_ended=true&limit=20`,
  );
  const venue = cards.items.find((c) => c.venue)?.venue;
  if (!venue) throw new Error(`У учреждения «${org.name}» нет площадок`);

  const base = {
    organization_id: org.id,
    venue_id: venue.id,
    summary: "Тестовое событие автотестов рабочего места. Снимается с публикации после прогона.",
    is_free: true,
    pushkin_card: false,
  };
  const create = (body: Record<string, unknown>) =>
    call<{ event_id: string }>("/admin/events", { method: "POST", admin: true, body: { ...base, ...body } });

  const cabinetTitle = `[e2e] Проверка кабинета ${run}`;
  const cabinetDate = ufaDate(150);
  const cabinet = await create({
    title: cabinetTitle,
    categories: ["education"],
    age_rating: 0,
    starts_at: `${cabinetDate}T04:00:00+05:00`,
  });
  const detail = await call<{ occurrences: { id: string }[] }>(`/v1/events/${cabinet.event_id}`);
  const occurrenceId = detail.occurrences[0]?.id;
  if (!occurrenceId) throw new Error("У тестового события нет сеанса");

  const titleA = `[e2e] Проверка модерации ${run}: струнный квартет`;
  const titleB = `[e2e] Проверка модерации ${run}: струнного квартета`;
  const startsAt = `${ufaDate(151)}T04:30:00+05:00`;
  const a = await create({ title: titleA, categories: ["music"], age_rating: 6, starts_at: startsAt });
  const b = await create({ title: titleB, categories: ["music"], age_rating: 12, starts_at: startsAt });

  const fixtures: Fixtures = {
    run,
    org: { id: org.id, name: org.name, query: ORG_QUERY },
    venue: { id: venue.id, name: venue.name },
    cabinetEvent: { id: cabinet.event_id, title: cabinetTitle, occurrenceId, date: cabinetDate },
    dedup: { a: a.event_id, b: b.event_id, titleA, titleB, taskId: null },
  };
  // Сохраняем сразу: даже если следующий шаг упадёт, global-teardown снимет созданные события.
  writeFileSync(FIXTURES_FILE, JSON.stringify(fixtures, null, 2));
  writeFileSync(CREATED_FILE, "[]");

  if (process.env.E2E_SKIP_DEDUP !== "1") {
    try {
      execFileSync("pnpm", ["--filter", "@afisha/api", "cli", "dedup"], { cwd: root, stdio: "pipe", timeout: 300_000 });
      const tasks = await call<{ id: string; entity_id: string; related_id: string }[]>(
        "/admin/moderation/tasks?kind=dedup_review&state=open",
        { admin: true },
      );
      const ids = new Set([a.event_id, b.event_id]);
      fixtures.dedup.taskId = tasks.find((t) => ids.has(t.entity_id) && ids.has(t.related_id))?.id ?? null;
      writeFileSync(FIXTURES_FILE, JSON.stringify(fixtures, null, 2));
    } catch (err) {
      // Сбой конвейера дедупликации (apps/api) не должен ронять остальные сценарии: тест модерации пропустится.
      console.warn(
        `⚠ cli dedup не отработал — тест решения по задаче модерации будет пропущен: ${(err as Error).message.split("\n")[0]}`,
      );
    }
  }
}
