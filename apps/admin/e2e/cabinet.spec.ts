import { expect, test } from "@playwright/test";
import { apiGet, expectAccessible, fixtures, signIn } from "./helpers";

type Detail = { occurrences: { id: string; status: string; status_reason: string | null }[] };

test.describe("кабинет учреждения", () => {
  test("выбор учреждения, отмена сеанса тестового события и возврат «по плану»", async ({ page, context }) => {
    const f = fixtures();
    await signIn(context, "institution");

    // Выбор учреждения через поиск
    await page.goto("/cabinet?change=1");
    await page.getByLabel("Название учреждения").fill(f.org.query);
    await page.getByRole("button", { name: "Найти" }).click();
    await page.getByRole("button", { name: `Открыть кабинет: ${f.org.name}` }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(f.org.name);
    await expect(page.getByRole("banner")).toContainText(`Учреждение: ${f.org.name}`);

    // Тестовое событие — через фильтр «С даты» (поиск по названию не используем: API пишет его в статистику спроса)
    await page.getByLabel("С даты").fill(f.cabinetEvent.date);
    await page.getByRole("button", { name: "Показать" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${f.cabinetEvent.date}`));
    const row = page.getByTestId("session").filter({ hasText: f.cabinetEvent.title });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("По плану")).toBeVisible();
    await expect(
      row.getByRole("link", { name: new RegExp(f.cabinetEvent.title.replace(/[[\]]/g, "\\$&")) }),
    ).toHaveAttribute("href", new RegExp(`/e/${f.cabinetEvent.id}$`));

    // Отменить: без причины нельзя
    await row.getByRole("button", { name: /^Отменить:/ }).click();
    const dialog = page.getByRole("dialog", { name: "Отменить сеанс" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Подписчики получат уведомление");
    await expectAccessible(page);
    await dialog.getByRole("button", { name: "Отменить сеанс" }).click();
    await expect(dialog.getByText("Укажите причину отмены")).toBeVisible();
    await expect(dialog.getByLabel(/Причина отмены/)).toBeFocused();
    await dialog.getByLabel(/Причина отмены/).fill("Автотест: проверка отмены");
    await dialog.getByRole("button", { name: "Отменить сеанс" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "Сеанс отменён" })).toContainText(
      "Подписчики получат уведомление",
    );
    await expect(row.getByText("Отменено")).toBeVisible();
    await expect(row.getByText("Причина: Автотест: проверка отмены")).toBeVisible();
    let ev = await apiGet<Detail>(`/v1/events/${f.cabinetEvent.id}`);
    expect(ev.occurrences.find((o) => o.id === f.cabinetEvent.occurrenceId)?.status).toBe("cancelled");

    // Вернуть по плану
    await row.getByRole("button", { name: /^Вернуть по плану:/ }).click();
    const restore = page.getByRole("dialog", { name: "Вернуть сеанс по плану" });
    await restore.getByRole("button", { name: "Вернуть по плану" }).click();
    await expect(restore).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "снова идёт по плану" })).toBeVisible();
    await expect(row.getByText("По плану")).toBeVisible();
    ev = await apiGet<Detail>(`/v1/events/${f.cabinetEvent.id}`);
    expect(ev.occurrences.find((o) => o.id === f.cabinetEvent.occurrenceId)?.status).toBe("scheduled");
  });

  test("перенос: дата и время по Уфе, проверка ввода; «Не менять» ничего не меняет", async ({ page, context }) => {
    const f = fixtures();
    await signIn(context, "ministry");
    await page.goto(`/cabinet?org=${f.org.id}&from=${f.cabinetEvent.date}`);
    const row = page.getByTestId("session").filter({ hasText: f.cabinetEvent.title });
    const opener = row.getByRole("button", { name: /^Перенести:/ });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Перенести сеанс" });
    await expect(dialog.getByLabel("Время (по Уфе, UTC+5)")).toHaveValue("04:00");
    await dialog.getByLabel("Новая дата", { exact: true }).fill("2020-01-01");
    await dialog.getByRole("button", { name: "Перенести" }).click();
    await expect(dialog.getByText("Новая дата должна быть в будущем")).toBeVisible();
    await dialog.getByRole("button", { name: "Не менять" }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(row.getByText("По плану")).toBeVisible();
  });
});
