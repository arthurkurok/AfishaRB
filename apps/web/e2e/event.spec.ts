import { expect, test } from "@playwright/test";
import { API, expectAccessible, pickEventId } from "./helpers";

test.describe("Паспорт события", () => {
  test("возрастной знак, сеансы, паспорт, JSON-LD, OG, действия", async ({ page, request }) => {
    const id = await pickEventId(request);
    const detail = await (await request.get(`${API}/v1/events/${id}`)).json();
    await page.goto(`/e/${id}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(detail.title);
    await expect(page.getByText(`Возрастное ограничение ${detail.age_rating}+`).first()).toBeAttached();
    await expect(page.getByRole("heading", { name: /Даты и время/ })).toBeVisible();
    const passport = page.getByRole("region", { name: "Паспорт события" });
    await expect(passport.getByText("Источники")).toBeVisible();
    await expect(passport.getByText(/Проверено/)).toBeVisible();
    await expect(passport.getByRole("heading", { name: "История изменений" })).toBeVisible();

    // JSON-LD schema.org/Event с eventStatus.
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@graph"][0]["@type"]).toBe("Event");
    expect(ld["@graph"][0].eventStatus).toMatch(/^https:\/\/schema\.org\/Event/);
    expect(ld["@graph"][0].startDate).toBe(detail.occurrences[0].starts_at);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", detail.title);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);

    // «В календарь» — .ics с сеансами.
    const ics = await request.get(`/e/${id}/ics`);
    expect(ics.headers()["content-type"]).toContain("text/calendar");
    expect(await ics.text()).toContain("BEGIN:VEVENT");

    await expectAccessible(page);
  });

  test("«Сообщить о неточности» отправляет жалобу в API", async ({ page, request }) => {
    const id = await pickEventId(request);
    let body: Record<string, unknown> | null = null;
    // Не засоряем очередь модерации: перехватываем запрос и проверяем его содержимое.
    await page.route(`${API}/v1/reports`, async (route) => {
      body = route.request().postDataJSON();
      await route.fulfill({ status: 202, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto(`/e/${id}`);
    await page.getByRole("button", { name: "Сообщить о неточности" }).click();
    const dialog = page.getByRole("dialog", { name: "Сообщить о неточности" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Неверная цена").check();
    await dialog.getByLabel(/Комментарий/).fill("Цена на сайте театра 600 ₽");
    await expectAccessible(page, { include: "dialog" });
    await dialog.getByRole("button", { name: "Отправить" }).click();
    await expect(dialog.getByText("Спасибо! Модератор проверит информацию.")).toBeVisible();
    expect(body).toMatchObject({ event_id: id, reason: "wrong_price", comment: "Цена на сайте театра 600 ₽" });
  });

  test("несуществующее событие — 404 и noindex", async ({ page }) => {
    await page.goto("/e/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("content")));
    expect(
      robots.some((c) => c?.includes("noindex")),
      robots.join(" | "),
    ).toBe(true);
  });
});
