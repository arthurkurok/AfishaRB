// Снимки прода для презентации. Запуск: node jury/presentation/shots-web.mjs
// Ходит на https://antihype.best, viewport 1280×800 (десктоп) и 390×844 (телефон),
// deviceScaleFactor 2, пишет shots/*.png. Слайды используют сжатые .jpg: после съёмки
// пересжать sips'ом (например: sips -s format jpeg -s formatOptions 82 --resampleWidth 1640 shots/X.png --out shots/X.jpg).
// Гида не спрашивает: разговорчивый скрин уже снят и лежит в shots/.
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const STAND = "https://antihype.best";
const OUT = (name) => join(here, "shots", `${name}.png`);
const TOKEN = process.env.AFISHA_ADMIN_TOKEN ?? "";

const browser = await chromium.launch();
const fail = (name, e) => {
  console.error(`${name}: ${e.message}`);
  process.exitCode = 1;
};

// Десктоп: один контекст, город Уфа кукой.
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: "ru-RU",
    timezoneId: "Asia/Yekaterinburg",
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const shot = (name) => page.screenshot({ path: OUT(name) });
  const go = (url, wait = 1200) => page.goto(url, { waitUntil: "networkidle" }).then(() => page.waitForTimeout(wait));

  try {
    // первый заход: модалка города
    await go(`${STAND}/`);
    await shot("home-modal");
    await page.evaluate(() => {
      document.cookie = "afisha_city=ufa; path=/; max-age=31536000";
    });

    // главная Уфы
    await go(`${STAND}/`);
    await shot("home-ufa");

    // поиск
    await go(`${STAND}/ru/search?q=%D1%81%D0%BF%D0%B5%D0%BA%D1%82%D0%B0%D0%BA%D0%BB%D1%8C`, 1800);
    await shot("search");

    // карточка и паспорт
    await go(`${STAND}/e/01a1d4f5-7b23-7c6b-a909-b65cdd0fd00b`);
    await shot("event");
    await page.locator("#passport").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(800);
    await shot("passport");

    // карта
    await go(`${STAND}/ru/m/ufa`, 2500);
    await shot("map");
  } catch (e) {
    fail("desktop", e);
  }
  await ctx.close();
}

// Телефон: сайт, Mini App, карточка.
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    locale: "ru-RU",
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  try {
    await page.goto(`${STAND}/`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      try {
        localStorage.setItem("afisha.cityAsked", "1");
      } catch {}
      document.cookie = "afisha_city=ufa; path=/; max-age=31536000";
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT("mobile-home") });

    await page.goto(`${STAND}/tma`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: OUT("mobile-tma") });

    await page.goto(`${STAND}/e/01a1d4f5-7b23-7c6b-a909-b65cdd0fd00b`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT("mobile-event") });
  } catch (e) {
    fail("mobile", e);
  }
  await ctx.close();
}

// Админка: логин токеном, «Пульс культуры».
if (TOKEN) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "ru-RU" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  try {
    await page.goto(`${STAND.replace("://", "://admin.")}/login`, { waitUntil: "networkidle" });
    await page.fill("input#token", TOKEN);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.includes("login"));
    await page.goto(`${STAND.replace("://", "://admin.")}/pulse`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: OUT("admin-pulse") });
  } catch (e) {
    fail("admin", e);
  }
  await ctx.close();
}

await browser.close();
