import { expect, test } from "@playwright/test";
import { expectAccessible, pickEventId } from "./helpers";

test.describe("Гид", () => {
  test("сценарий ТЗ: «Куда пойти в субботу с ребёнком до 1000 рублей»", async ({ page }) => {
    await page.goto("/guide");
    await page.getByLabel("Ваш запрос Гиду").fill("Куда пойти в субботу с ребёнком до 1000 рублей");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.locator("[data-kind]").first()).toBeVisible();

    // Гид может задать до двух уточнений (город, возраст ребёнка) — отвечаем кнопками.
    for (let i = 0; i < 3; i++) {
      const last = page.locator("[data-kind]").last();
      const kind = await last.getAttribute("data-kind");
      if (kind !== "clarify") break;
      const ufa = last.getByRole("button", { name: "Уфа", exact: true });
      const age = last.getByRole("button", { name: "3–5 лет" });
      if (await ufa.count()) await ufa.click();
      else if (await age.count()) await age.click();
      else await last.getByRole("button", { name: "Неважно, покажи что есть" }).click();
      await expect(page.locator("[data-kind]")).toHaveCount(i + 2);
    }

    const answer = page.locator('[data-kind="results"]').last();
    await expect(answer).toBeVisible();
    // Чипы понимания: дата и бюджет сказаны пользователем — сплошной контур.
    const chips = answer.getByRole("list", { name: "Как Гид понял запрос" });
    await expect(chips.getByRole("button", { name: /Суббота.*сказано вами/ })).toBeVisible();
    await expect(chips.getByRole("button", { name: /1000 ₽.*сказано вами/ })).toBeVisible();
    // Карточки — реальные события из API со ссылкой на паспорт и причинами выбора.
    const cards = answer.locator("article");
    await expect(cards.first()).toBeVisible();
    await expect(cards.first().getByRole("link")).toHaveAttribute("href", /\/e\/[0-9a-f-]{36}$/);
    await expect(cards.first().getByText("подходит по возрасту", { exact: true })).toBeVisible();
    await expect(answer.getByRole("link", { name: "Как это работает" })).toHaveAttribute(
      "href",
      "/about#recommendations",
    );

    const mode = await page.getByTestId("rules-banner").count();
    if (mode) await expect(page.getByText("Умный подбор временно упрощён")).toBeVisible();

    // Изменение чипа: бюджет → «Бесплатно».
    await chips.getByRole("button", { name: /^до 1000 ₽ — сказано вами/ }).click();
    await page
      .getByRole("group", { name: /Варианты для/ })
      .getByRole("button", { name: "Бесплатно" })
      .click();
    await expect(page.locator("[data-kind]").last().getByText("бесплатно", { exact: true }).first()).toBeVisible();

    // «×» на чипе снимает условие готовым патчем от API (chip.clear).
    const last = page.locator("[data-kind]").last();
    const removable = last.getByRole("button", { name: /^Убрать условие/ });
    if (await removable.count()) {
      const before = await page.locator("[data-kind]").count();
      await removable.first().click();
      await expect(page.locator("[data-kind]")).toHaveCount(before + 1);
    }

    await expectAccessible(page);
  });

  test("вопрос о конкретном событии на паспорте события", async ({ page, request }) => {
    const id = await pickEventId(request);
    await page.goto(`/e/${id}`);
    const box = page.getByRole("region", { name: "Спросить Гида об этом событии" });
    await box.getByRole("button", { name: "Сколько стоят билеты?" }).click();
    await expect(box.locator("ol li").first()).not.toContainText("Гид подбирает");
    await expect(box.locator("ol li").first()).toContainText(/₽|бесплатн|цен|касс|Цен/i);
  });
});
