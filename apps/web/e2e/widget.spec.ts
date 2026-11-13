import { expect, test } from "@playwright/test";
import { expectAccessible } from "./helpers";

const DEMO = "http://localhost:5174/demo/ministry.html";

test.describe("Виджет на сайте министерства", () => {
  test("<afisha-rb> рисует афишу в Shadow DOM без cookies и localStorage", async ({ page, context }) => {
    await page.goto(DEMO);
    const main = page.getByTestId("widget-main");
    // Playwright пробивает открытый Shadow DOM.
    await expect(main.getByRole("heading", { name: "Афиша культуры Башкортостана" })).toBeVisible();
    const cards = main.locator("a.card");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first()).toHaveAttribute("href", /^http:\/\/localhost:3000\/e\/[0-9a-f-]{36}$/);
    await expect(cards.first()).toHaveAttribute("target", "_blank");
    expect(await main.evaluate((el) => el.shadowRoot !== null)).toBe(true);

    // Компактный виджет в сайдбаре — на башкирском.
    const side = page.getByTestId("widget-side");
    await expect(side.getByRole("heading", { name: "Башҡортостан мәҙәниәте афишаһы" })).toBeVisible();

    // Карусель управляется с клавиатуры.
    const next = main.getByRole("button", { name: "Следующие события" });
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(main.getByRole("button", { name: "Предыдущие события" })).toBeEnabled();

    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
    await expectAccessible(page, { include: "afisha-rb" });
  });

  test("iframe-фоллбэк сообщает высоту через postMessage", async ({ page }) => {
    await page.goto(DEMO);
    const frame = page.locator("#afisha-rb-frame");
    await expect.poll(async () => frame.evaluate((el) => (el as HTMLIFrameElement).style.height)).toMatch(/^\d+px$/);
    await expect(
      page.frameLocator("#afisha-rb-frame").getByRole("heading", { name: "Афиша культуры Башкортостана" }),
    ).toBeVisible();
  });
});
