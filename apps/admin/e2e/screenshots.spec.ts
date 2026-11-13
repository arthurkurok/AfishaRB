import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { apiGet, fixtures, signIn } from "./helpers";

/** Скриншоты ключевых экранов для жюри: светлая и тёмная тема, 1440×900 и 390×844. */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../jury/reports/artifacts/admin");
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
const THEMES = ["light", "dark"] as const;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(300);
}

for (const theme of THEMES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${theme} ${vp.width}×${vp.height}`, () => {
      test.use({ colorScheme: theme, viewport: vp });
      const shot = (page: Page, name: string, fullPage = true) =>
        page.screenshot({ path: resolve(OUT, `${name}-${theme}-${vp.width}x${vp.height}.png`), fullPage });

      test("вход", async ({ page }) => {
        await page.goto("/login");
        await settle(page);
        await shot(page, "login");
      });

      test("пульс культуры", async ({ page, context }) => {
        await signIn(context, "ministry");
        await page.goto("/?days=30");
        await settle(page);
        await shot(page, "pulse");
      });

      test("кабинет учреждения и диалог отмены", async ({ page, context }) => {
        const f = fixtures();
        // Обзор — на реальном учреждении без тестовых событий; диалог — на тестовом событии (ничего не сохраняется).
        const [showcase] = await apiGet<{ id: string }[]>(
          `/v1/organizations?q=${encodeURIComponent(process.env.E2E_SCREENS_ORG_QUERY ?? "театр оперы и балета")}&limit=1`,
        );
        await signIn(context, "ministry");
        await page.goto(`/cabinet?org=${showcase?.id ?? f.org.id}`);
        await expect(page.getByRole("heading", { name: "Полнота данных" })).toBeVisible();
        await settle(page);
        await shot(page, "cabinet");
        await page.goto(`/cabinet?org=${f.org.id}&from=${f.cabinetEvent.date}`);
        await page
          .getByTestId("session")
          .filter({ hasText: f.cabinetEvent.title })
          .getByRole("button", { name: /^Отменить:/ })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("textbox")
          .fill("Болезнь исполнителя главной роли. Билеты принимает касса.");
        await settle(page);
        await shot(page, "cabinet-cancel-dialog", false);
      });

      test("новое событие: черновик от помощника", async ({ page, context }) => {
        const f = fixtures();
        await signIn(context, "institution");
        await page.goto(`/cabinet/new?org=${f.org.id}`);
        await page
          .getByLabel("Текст анонса", { exact: true })
          .fill(
            "Башкирский театр кукол приглашает на премьеру спектакля «Сказка о курае» 28 декабря в 11:00. Билеты от 400 рублей. 6+\nСпектакль на башкирском языке с синхронным переводом.",
          );
        await settle(page);
        await shot(page, "new-event-step1");
        await page.getByRole("button", { name: "Заполнить форму" }).click();
        await expect(page.getByRole("heading", { name: "Проверьте и опубликуйте" })).toBeVisible();
        await settle(page);
        await shot(page, "new-event-step2");
      });

      test("модерация: дубли бок о бок", async ({ page, context }) => {
        await signIn(context, "ministry");
        await page.goto("/moderation");
        await settle(page);
        await shot(page, "moderation");
      });

      test("жалобы и обратная связь", async ({ page, context }) => {
        await signIn(context, "ministry");
        await page.goto("/moderation/reports");
        await settle(page);
        await shot(page, "reports");
      });
    });
  }
}
