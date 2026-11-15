import { expect, test } from "@playwright/test";
import { adminGet, expectAccessible, fixtures, signIn } from "./helpers";

test.describe("модерация", () => {
  test("дубли бок о бок: горячая клавиша, подтверждение, решение", async ({ page, context }) => {
    const f = fixtures();
    test.skip(!f.dedup.taskId, "Тестовая задача дублей не создана (E2E_SKIP_DEDUP или dedup не нашёл пару)");
    await signIn(context, "ministry");
    await page.goto(`/moderation?task=${f.dedup.taskId}`);

    const task = page.getByTestId("dedup-task");
    await expect(task.getByRole("heading", { name: "Это одно и то же событие?" })).toBeVisible();
    const table = task.getByRole("table");
    await expect(table).toContainText(f.dedup.titleA);
    await expect(table).toContainText(f.dedup.titleB);
    await expect(task).toContainText("Сходство");
    await expect(task.getByText("та же площадка")).toBeVisible();
    await expect(table.getByRole("row", { name: /Возраст/ })).toContainText("отличается");
    await expect(task.getByRole("link", { name: /Паспорт А/ })).toHaveAttribute("href", /\/e\/[0-9a-f-]{36}$/);
    await expectAccessible(page);

    // Горячая клавиша «1» — подтверждение объединения, фокус на «Да, объединить»
    await page.keyboard.press("1");
    const confirm = task.getByRole("button", { name: "Да, объединить" });
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Объединено" })).toBeVisible();

    const open = await adminGet<{ id: string }[]>("/admin/moderation/tasks?kind=dedup_review&state=open");
    expect(open.some((t) => t.id === f.dedup.taskId)).toBe(false);
  });

  test("горячие клавиши можно выключить (WCAG 2.1.4)", async ({ page, context }) => {
    await signIn(context, "ministry");
    await page.goto("/moderation");
    const task = page.getByTestId("dedup-task");
    test.skip((await task.count()) === 0, "очередь пуста");
    await task.getByLabel("Горячие клавиши").uncheck();
    await page.keyboard.press("1");
    await expect(task.getByRole("button", { name: "Да, объединить" })).toHaveCount(0);
    await task.getByLabel("Горячие клавиши").check();
  });

  test("исчезнувший сеанс: карточка без сырого JSON, понятные решения", async ({ page, context }) => {
    await signIn(context, "ministry");
    await page.goto("/moderation?kind=vanished");
    const task = page.getByTestId("moderation-task");
    test.skip((await task.count()) === 0, "в очереди нет исчезнувших сеансов");
    await expect(task.locator("#task-title")).not.toHaveText(/^\s*(Без названия)?\s*$/);
    await expect(page.locator("pre")).toHaveCount(0);
    await expect(task).not.toContainText('"source"');
    await expect(task).not.toContainText("не предусмотрено API");
    await expect(task.getByText("Источник", { exact: true })).toBeVisible();
    const upcoming = (await task.getByRole("button", { name: /Подтвердить: идёт по плану/ }).count()) > 0;
    if (upcoming) {
      await expect(task.getByRole("button", { name: /Отменить сеанс/ })).toBeVisible();
      // Отмена — только после подтверждения; данные в этом тесте не меняем
      await page.keyboard.press("2");
      await expect(task.getByRole("button", { name: "Да, отменить сеанс" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(task.getByRole("button", { name: "Да, отменить сеанс" })).toHaveCount(0);
    } else {
      await expect(task.getByRole("button", { name: "Закрыть", exact: true })).toBeVisible();
    }
    await expectAccessible(page);
  });

  test("жалобы и обратная связь", async ({ page, context }) => {
    await signIn(context, "ministry");
    await page.goto("/moderation/reports");
    await expect(page.getByRole("heading", { level: 1, name: "Жалобы и обратная связь" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Правки перевода/ })).toBeVisible();
    await page.getByRole("link", { name: /Правки перевода/ }).click();
    await expect(page).toHaveURL(/type=translation/);
    await expectAccessible(page);
  });
});
