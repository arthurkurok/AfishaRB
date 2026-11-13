import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, pickEventId } from "./helpers";

/** ПП РФ № 102 / WCAG 1.4.10: при масштабе 200 % (≈ 320–640 CSS px) нет горизонтальной прокрутки. */
test.describe("Масштаб 200 % и узкий экран", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const path of ["/", "/search?when=week", "/guide", "/about", "/developers", "/m", "/ba"]) {
    test(`без горизонтальной прокрутки: ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    });
  }

  test("паспорт события и режим «Крупный текст»", async ({ page, request }) => {
    const id = await pickEventId(request);
    await page.addInitScript(() => window.localStorage.setItem("afisha.contrast", "high"));
    await page.goto(`/e/${id}`);
    await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
    await expectNoHorizontalScroll(page);
  });
});

test("башкирские буквы рисуются фирменным шрифтом, без подстановки системного", async ({ page }) => {
  await page.goto("/ba/about");
  const sample = page.getByRole("heading", { level: 2, name: "Башҡортса тәржемә" });
  await expect(sample).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: -1 });
  const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#translation-title" });
  const { fonts } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
  const families = fonts.map((f) => f.familyName);
  expect(
    families.every((f) => /Commissioner/i.test(f)),
    families.join(", "),
  ).toBe(true);

  const { nodeId: bodyText } = await client.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "#translation p",
  });
  const body = await client.send("CSS.getPlatformFontsForNode", { nodeId: bodyText });
  expect(
    body.fonts.every((f) => /Golos/i.test(f.familyName)),
    body.fonts.map((f) => f.familyName).join(", "),
  ).toBe(true);
});
