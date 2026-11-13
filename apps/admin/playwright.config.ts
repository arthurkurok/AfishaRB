import { defineConfig, devices } from "@playwright/test";

/**
 * E2E рабочего места: next start на собранном приложении + реальный API (http://localhost:8000, токен dev-admin-token).
 * Перед запуском: pnpm --filter @afisha/admin build.
 *   pnpm --filter @afisha/admin e2e           — сценарии + axe-core (WCAG 2.2 AA), 1440×900 и 390×844
 *   pnpm --filter @afisha/admin screenshots   — скриншоты в jury/reports/artifacts/admin/
 * Тесты, которые меняют данные, работают только со своими событиями «[e2e] …» (создаются в global-setup через
 * POST /admin/events); в global-teardown сеансы этих событий отменяются, чтобы они не остались в афише.
 */
const PORT = Number(process.env.ADMIN_PORT ?? 3001);
export const E2E_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET ?? "e2e-session-secret-for-playwright-only-0001";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    timezoneId: "Asia/Yekaterinburg",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /screenshots\.spec/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /(a11y|responsive)\.spec/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    { name: "screens", testMatch: /screenshots\.spec/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ADMIN_SESSION_SECRET: E2E_SESSION_SECRET,
      ADMIN_API_BASE: process.env.ADMIN_API_BASE ?? "http://localhost:8000",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    },
  },
});
