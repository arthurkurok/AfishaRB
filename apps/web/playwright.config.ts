import { defineConfig, devices } from "@playwright/test";

/**
 * E2E: сайт (next start на собранном приложении), Mini App, iframe-фоллбэк и виджет на демо-странице «сайта министерства».
 * Требуется запущенный API (http://localhost:8000). Перед запуском: pnpm --filter @afisha/widget build && pnpm --filter @afisha/web build.
 *   pnpm --filter @afisha/web e2e           — сценарии + axe-core
 *   pnpm --filter @afisha/web screenshots   — скриншоты в jury/reports/artifacts/web/
 */
const PORT = Number(process.env.WEB_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
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
      testMatch: /(home|search|event|reflow)\.spec/,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    { name: "screens", testMatch: /screenshots\.spec/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: `pnpm exec next start -p ${PORT}`,
      url: `http://localhost:${PORT}/robots.txt`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @afisha/widget demo",
      url: "http://localhost:5174/demo/ministry.html",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
