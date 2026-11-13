import { expect, test } from "@playwright/test";
import { ADMIN_TOKEN, signIn } from "./helpers";

test.describe("вход и сессия", () => {
  test("без входа — на страницу входа с возвратом", async ({ page }) => {
    await page.goto("/moderation");
    await expect(page).toHaveURL(/\/login\?next=%2Fmoderation/);
    await expect(page.getByRole("heading", { name: "Вход для сотрудников" })).toBeVisible();
  });

  test("неверный токен — понятная ошибка", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Токен доступа").fill("wrong-token");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.locator("#login-error")).toHaveText(/Токен не подошёл/);
    await expect(page.getByLabel("Токен доступа")).toBeFocused();
    await expect(page).toHaveURL(/\/login/);
  });

  test("логин → дашборд; токен только в httpOnly-cookie, выход", async ({ page, context }) => {
    await page.goto("/login?next=%2F%3Fdays%3D7");
    await page.getByLabel("Токен доступа").fill(ADMIN_TOKEN);
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Пульс культуры" })).toBeVisible();
    await expect(page).toHaveURL(/days=7/);

    const cookie = (await context.cookies()).find((c) => c.name === "afisha_admin_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.value).not.toContain(ADMIN_TOKEN);
    // Токен не попадает ни в HTML, ни в доступные скриптам cookie.
    expect(await page.content()).not.toContain(ADMIN_TOKEN);
    expect(await page.evaluate(() => document.cookie)).not.toContain("afisha_admin_session");

    await expect(page.getByRole("button", { name: "Министерство" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login\?reason=logout/);
    await expect(page.getByRole("status")).toContainText("Вы вышли");
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("отозванный токен (API отвечает 401) — сессия сбрасывается, снова вход", async ({ page, context }) => {
    await signIn(context, "ministry", "revoked-token");
    await page.goto("/moderation");
    await expect(page).toHaveURL(/\/login\?next=%2Fmoderation&reason=expired/);
    await expect(page.getByRole("status")).toContainText("Сессия истекла");
    expect((await context.cookies()).some((c) => c.name === "afisha_admin_session")).toBe(false);
  });

  test("роль «Учреждение»: только кабинет", async ({ page, context }) => {
    await signIn(context, "institution");
    await page.goto("/");
    await expect(page).toHaveURL(/\/cabinet/);
    const nav = page.getByRole("navigation", { name: "Разделы" });
    await expect(nav.getByRole("link", { name: "Кабинет учреждения" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Пульс культуры" })).toHaveCount(0);
    await page.getByRole("button", { name: "Министерство" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Пульс культуры" })).toBeVisible();
  });
});
