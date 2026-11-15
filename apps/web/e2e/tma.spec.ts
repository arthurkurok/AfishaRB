import { expect, test } from "@playwright/test";
import { pickEventId } from "./helpers";

/** Минимальная имитация telegram-web-app.js: фиксируем вызовы BackButton/MainButton/haptics. */
const TELEGRAM_STUB = () => {
  const calls: string[] = [];
  const button = (name: string) => ({
    setText: (t: string) => calls.push(`${name}.setText:${t}`),
    show: () => calls.push(`${name}.show`),
    hide: () => calls.push(`${name}.hide`),
    enable: () => {},
    disable: () => {},
    onClick: () => {},
    offClick: () => {},
  });
  (window as unknown as { __tgCalls: string[] }).__tgCalls = calls;
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initData: "query_id=test",
      colorScheme: "dark",
      themeParams: { bg_color: "#17212b", text_color: "#f5f5f5", hint_color: "#aab2bd", secondary_bg_color: "#232e3c" },
      platform: "tdesktop",
      version: "8.0",
      ready: () => calls.push("ready"),
      expand: () => calls.push("expand"),
      BackButton: button("BackButton"),
      MainButton: button("MainButton"),
      HapticFeedback: {
        impactOccurred: () => calls.push("haptic"),
        selectionChanged: () => calls.push("haptic"),
        notificationOccurred: () => calls.push("haptic"),
      },
      openLink: (url: string) => calls.push(`openLink:${url}`),
      onEvent: () => {},
      offEvent: () => {},
      setHeaderColor: () => {},
    },
  };
};

test.describe("Telegram Mini App", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://telegram.org/js/telegram-web-app.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: "" }),
    );
    await page.addInitScript(TELEGRAM_STUB);
  });

  test("тема Telegram, BackButton на вложенном экране, MainButton «Купить билеты»", async ({ page, request }) => {
    await page.goto("/tma");
    await expect(page.locator("html")).toHaveAttribute("data-tma", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--color-bg"))).toBe("#17212b");
    await expect(page.getByRole("tab", { name: "Сегодня" })).toBeVisible();
    await expect(page.getByTestId("disclaimer")).toContainText("Не является официальным сервисом");

    // exact: ссылка-бренд «Афиша РБ» тоже содержит слово «Афиша»
    await page.getByRole("link", { name: "Афиша", exact: true }).click();
    await expect(page).toHaveURL(/\/tma\/search/);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __tgCalls: string[] }).__tgCalls))
      .toContain("BackButton.show");
    expect(await page.evaluate(() => (window as unknown as { __tgCalls: string[] }).__tgCalls)).toContain("haptic");

    const id = await pickEventId(request, "when=month&pushkin=true&limit=20");
    await page.goto(`/tma/e/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
