import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

test.describe("Главная", () => {
  test("Гид, переключатель дней, зонтик курая, подборки", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Куда сходить в Башкортостане");
    await expect(page.getByRole("search").getByLabel("Спросите Гида, куда сходить")).toBeVisible();
    await expect(page.getByRole("link", { name: "Куда пойти в субботу с ребёнком до 1000 рублей" })).toHaveAttribute(
      "href",
      /\/guide\?q=/,
    );

    const tabs = page.getByRole("tablist", { name: "Период" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    await expect(tabs.getByRole("tab", { name: "Сегодня" })).toHaveAttribute("aria-selected", "true");
    // Клавиатура: стрелка вправо переключает вкладку (WAI-ARIA Tabs).
    await tabs.getByRole("tab", { name: "Сегодня" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.getByRole("tab", { name: "Завтра" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Завтра" })).toBeVisible();

    const umbrella = page.getByRole("navigation", { name: "Что вам интересно?" });
    await expect(umbrella.getByRole("link")).toHaveCount(7);
    await expect(umbrella.getByRole("link", { name: /Театр/ })).toHaveAttribute("href", "/search?categories=theatre");

    await expect(page.getByRole("heading", { name: "Бесплатно", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Пушкинская карта", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Детям", level: 2 })).toBeVisible();
    await expect(page.getByLabel("Город или район")).toBeVisible();
    await expectAccessible(page);
  });

  test("башкирская версия, тёмная тема и режим «Крупный текст»", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Башҡортса" }).click();
    await expect(page).toHaveURL(/\/ba$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ba");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Башҡортостанда ҡайҙа барырға");
    await expect(page.getByRole("tab", { name: "Бөгөн" })).toBeVisible();

    const theme = page.getByRole("button", { name: /^Тема:/ });
    await theme.click(); // как в системе → светлая
    await theme.click(); // → тёмная
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const contrast = page.getByRole("button", { name: "Эре текст һәм юғары контраст" });
    await contrast.click();
    await expect(contrast).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    // Выбор переживает перезагрузку (хранится только в браузере).
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectAccessible(page);
  });
});
