import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { apiGet, CREATED_FILE, expectAccessible, fixtures, signIn } from "./helpers";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

test("«Новое событие»: текст анонса → черновик → проверка → публикация", async ({ page, context }) => {
  const f = fixtures();
  await signIn(context, "institution");
  const day = new Date(Date.now() + 155 * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Yekaterinburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(day)
    .split("-");
  const [y, m, d] = parts.map(Number) as [number, number, number];
  const title = `[e2e] Проверка публикации ${f.run}`;
  const announcement = `Приглашаем на концерт «${title}» ${d} ${MONTHS[m - 1]} в 05:00. Билеты от 300 рублей. 6+\nКамерная программа для всей семьи.`;

  await page.goto(`/cabinet/new?org=${f.org.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Новое событие" })).toBeVisible();
  await page.getByLabel("Текст анонса", { exact: true }).fill(announcement);
  await page.getByRole("button", { name: "Заполнить форму" }).click();

  const form = page.getByRole("form", { name: "Проверьте и опубликуйте" });
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Название", { exact: true })).toHaveValue(title);
  await expect(form.getByLabel("Дата начала")).toHaveValue(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  );
  await expect(form.getByLabel(/^Начало/)).toHaveValue("05:00");
  await expect(form.getByRole("radio", { name: "6+", exact: true })).toBeChecked();
  await expect(form.getByText("Найдено в тексте").first()).toBeVisible();
  await expectAccessible(page);

  // Без площадки форма не отправляется — ошибка с переходом к полю
  await form.getByLabel("Площадка").selectOption("");
  await form.getByRole("button", { name: "Опубликовать событие" }).click();
  await expect(form.getByRole("alert")).toContainText("Площадка: Выберите площадку");
  await form.getByLabel("Площадка").selectOption(f.venue.id);
  await form.getByLabel("Ссылка на билеты").fill("https://example.org/tickets");
  await form.getByRole("button", { name: "Опубликовать событие" }).click();

  await expect(page.getByRole("heading", { name: "Событие опубликовано" })).toBeVisible();
  const href = await page.getByTestId("published-link").getAttribute("href");
  const eventId = href?.match(/\/e\/([0-9a-f-]{36})$/)?.[1];
  expect(eventId, `ссылка на паспорт: ${href}`).toBeTruthy();
  const created = JSON.parse(readFileSync(CREATED_FILE, "utf8")) as string[];
  writeFileSync(CREATED_FILE, JSON.stringify([...created, eventId]));

  const ev = await apiGet<{
    title: string;
    age_rating: number;
    provenance: { sources: { id: string }[] };
    ticket_url: string | null;
  }>(`/v1/events/${eventId}`);
  expect(ev.title).toBe(title);
  expect(ev.age_rating).toBe(6);
  expect(ev.provenance.sources.map((s) => s.id)).toContain("organizer_cabinet");
});
