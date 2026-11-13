import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoHorizontalScroll, fixtures, signIn } from "./helpers";

/** axe-core (WCAG 2.2 AA) и отсутствие горизонтальной прокрутки на ключевых экранах: 1440×900 и 390×844. */
test.describe("доступность", () => {
  test("вход", async ({ page }) => {
    await page.goto("/login");
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  for (const [name, path] of [
    ["пульс культуры", "/"],
    ["выбор учреждения", "/cabinet?change=1"],
    ["модерация", "/moderation"],
    ["жалобы", "/moderation/reports"],
  ] as const) {
    test(name, async ({ page, context }) => {
      await signIn(context, "ministry");
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
      await expectNoHorizontalScroll(page);
    });
  }

  test("кабинет учреждения и новое событие", async ({ page, context }) => {
    const f = fixtures();
    await signIn(context, "institution");
    await page.goto(`/cabinet?org=${f.org.id}`);
    await expect(page.getByRole("heading", { level: 2, name: "Полнота данных" })).toBeVisible();
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
    await page.goto(`/cabinet/new?org=${f.org.id}`);
    await expectAccessible(page);
    await expectNoHorizontalScroll(page);
  });

  test.describe("тёмная тема", () => {
    test.use({ colorScheme: "dark" });
    const pages: [string, (f: ReturnType<typeof fixtures>) => string][] = [
      ["пульс культуры", () => "/"],
      ["модерация", () => "/moderation"],
      ["кабинет", (f) => `/cabinet?org=${f.org.id}&from=${f.cabinetEvent.date}`],
      ["новое событие", (f) => `/cabinet/new?org=${f.org.id}`],
    ];
    for (const [name, path] of pages) {
      test(name, async ({ page, context }) => {
        await signIn(context, "ministry");
        await page.goto(path(fixtures()));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (name === "кабинет")
          await expect(page.getByRole("heading", { level: 2, name: "Полнота данных" })).toBeVisible();
        await expectAccessible(page);
      });
    }
  });
});
