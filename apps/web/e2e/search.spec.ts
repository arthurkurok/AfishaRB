import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test.describe("Поиск", () => {
  test("фильтры ТЗ меняют URL и выдачу, чипы снимаются, лента по дням", async ({ page, isMobile }) => {
    await page.goto("/search");
    await page.locator("[data-hydrated]").waitFor();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Афиша событий");
    if (isMobile) await page.getByRole("button", { name: /Фильтры/ }).click();
    const filters = page.locator("#search-filters");
    await filters.getByRole("radio", { name: "Выходные" }).check();
    await filters.getByLabel("Город или район").selectOption("ufa");
    await filters.getByLabel("Возраст ребёнка").selectOption("5");
    await filters.getByRole("radio", { name: "до 1000 ₽" }).check();
    if (isMobile) await filters.getByRole("button", { name: "Показать" }).click();

    await expect(page).toHaveURL(/when=weekend/);
    await expect(page).toHaveURL(/municipality=ufa/);
    await expect(page).toHaveURL(/price_max=1000/);
    await expect(page).toHaveURL(/age=5/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Афиша: Уфа");
    await expect(page.getByRole("heading", { level: 2, name: /^Нашли \d+/ })).toBeVisible();

    const chip = page.getByRole("button", { name: "Убрать фильтр «ребёнок 5 лет»" });
    await expect(chip).toBeVisible();
    // Заголовки дней — липкие.
    const day = page.locator("h3[id^=day-]").first();
    await expect(day).toBeVisible();
    expect(await day.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");

    await chip.click();
    await expect(page).not.toHaveURL(/age=5/);
    await expectAccessible(page);
  });

  test("курсорная пагинация «Показать ещё»", async ({ page }) => {
    await page.goto("/search?when=month");
    await page.locator("[data-hydrated]").waitFor();
    const cards = page.locator("article");
    await expect(cards.first()).toBeVisible();
    const before = await cards.count();
    await page.getByRole("button", { name: "Показать ещё" }).click();
    await expect.poll(() => cards.count()).toBeGreaterThan(before);
  });

  test("пустая выдача — понятное состояние с действием", async ({ page }) => {
    await page.goto("/search?q=zzzzqqqxxyy");
    await expect(page.getByRole("heading", { name: "Ничего не нашлось" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Сбросить фильтры" })).toBeVisible();
  });
});
