import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { pickEventId } from "./helpers";

/** Скриншоты ключевых экранов для жюри: светлая и тёмная тема, 390×844 и 1440×900. */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../jury/reports/artifacts/web");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;
const THEMES = ["light", "dark"] as const;

const TELEGRAM_STUB = () => {
  const noop = () => {};
  const button = { setText: noop, show: noop, hide: noop, enable: noop, disable: noop, onClick: noop, offClick: noop };
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  (window as unknown as { Telegram: unknown }).Telegram = {
    WebApp: {
      initData: "query_id=screens",
      colorScheme: dark ? "dark" : "light",
      themeParams: dark
        ? {
            bg_color: "#17212b",
            text_color: "#f5f5f5",
            hint_color: "#aab2bd",
            secondary_bg_color: "#232e3c",
            section_bg_color: "#1e2a37",
          }
        : {
            bg_color: "#ffffff",
            text_color: "#000000",
            hint_color: "#707579",
            secondary_bg_color: "#f4f4f5",
            section_bg_color: "#ffffff",
          },
      ready: noop,
      expand: noop,
      BackButton: button,
      MainButton: button,
      HapticFeedback: { impactOccurred: noop, selectionChanged: noop, notificationOccurred: noop },
      openLink: noop,
      onEvent: noop,
      offEvent: noop,
    },
  };
};

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Ленивые картинки: прокручиваем страницу, чтобы они загрузились до снимка.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${theme} ${vp.width}×${vp.height}`, () => {
      test.use({ colorScheme: theme, viewport: vp });
      const name = (screen: string) => resolve(OUT, `${screen}-${theme}-${vp.width}x${vp.height}.png`);

      test("главная", async ({ page }) => {
        await page.goto("/");
        await settle(page);
        await page.screenshot({ path: name("home"), fullPage: true });
      });

      test("поиск с фильтрами", async ({ page }) => {
        await page.goto("/search?when=weekend&municipality=ufa&age=5");
        await settle(page);
        await page.screenshot({ path: name("search"), fullPage: vp.width > 600 });
      });

      test("паспорт события", async ({ page, request }) => {
        const id = await pickEventId(request);
        await page.goto(`/e/${id}`);
        await settle(page);
        await page.screenshot({ path: name("event"), fullPage: true });
      });

      test("Гид: сценарий ТЗ", async ({ page }) => {
        await page.goto(`/guide?q=${encodeURIComponent("Куда пойти в субботу с ребёнком до 1000 рублей")}`);
        await page.locator("[data-kind]").first().waitFor();
        for (let i = 0; i < 3; i++) {
          const last = page.locator("[data-kind]").last();
          if ((await last.getAttribute("data-kind")) !== "clarify") break;
          const ufa = last.getByRole("button", { name: "Уфа", exact: true });
          const age = last.getByRole("button", { name: "3–5 лет" });
          if (await ufa.count()) await ufa.click();
          else if (await age.count()) await age.click();
          else break;
          await expect(page.locator("[data-kind]")).toHaveCount(i + 2);
        }
        await expect(page.locator('[data-kind="results"]').last()).toBeVisible();
        await settle(page);
        await page.screenshot({ path: name("guide"), fullPage: true });
      });

      test("город (SEO-страница)", async ({ page }) => {
        await page.goto("/m/ufa");
        await settle(page);
        await page.screenshot({ path: name("municipality"), fullPage: vp.width > 600 });
      });

      test("разработчикам: конструктор виджета", async ({ page }) => {
        await page.goto("/developers#widget");
        await page.getByTestId("widget-preview").locator("afisha-rb").waitFor();
        await settle(page);
        await page.locator("#widget").scrollIntoViewIfNeeded();
        await page.screenshot({ path: name("developers"), fullPage: false });
      });

      test("о проекте (ba)", async ({ page }) => {
        await page.goto("/ba/about");
        await settle(page);
        await page.screenshot({ path: name("about-ba"), fullPage: false });
      });

      test("Telegram Mini App", async ({ page }) => {
        await page.route("https://telegram.org/js/telegram-web-app.js", (r) =>
          r.fulfill({ contentType: "text/javascript", body: "" }),
        );
        await page.addInitScript(TELEGRAM_STUB);
        await page.goto("/tma");
        await settle(page);
        await page.screenshot({ path: name("tma"), fullPage: false });
      });

      test("виджет на сайте министерства", async ({ page }) => {
        await page.goto("http://localhost:5174/demo/ministry.html");
        await page.getByTestId("widget-main").locator("a.card").first().waitFor();
        await settle(page);
        await page.screenshot({ path: name("widget-demo"), fullPage: true });
      });
    });
  }
}
