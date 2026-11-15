// Снимки прода для презентации. Запуск: node jury/presentation/shots-web.mjs [каталог] [имя ...]
// Ходит на https://antihype.best; десктоп 1440×900, телефон 390×844, deviceScaleFactor 2.
// Пишет PNG в каталог (по умолчанию shots/raw); слайды используют сжатые .jpg из shots/:
//   sips -s format jpeg -s formatOptions 84 --resampleWidth 2000 shots/raw/X.png --out shots/X.jpg
// Админка: нужен AFISHA_ADMIN_TOKEN прода в окружении.
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const STAND = "https://antihype.best";
const ADMIN = "https://admin.antihype.best";
const EVENT = "01a1d4f5-7b23-7c6b-a909-b65cdd0fd00b";
const outDir = resolve(process.argv[2] ?? join(here, "shots/raw"));
const only = new Set(process.argv.slice(3));
const want = (name) => only.size === 0 || only.has(name);
mkdirSync(outDir, { recursive: true });
const OUT = (name) => join(outDir, `${name}.png`);
const TOKEN = process.env.AFISHA_ADMIN_TOKEN ?? "";

const browser = await chromium.launch();
const fail = (name, e) => {
  console.error(`${name}: ${e.message.split("\n")[0]}`);
  process.exitCode = 1;
};
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

// ---------- Десктоп ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "ru-RU",
    timezoneId: "Asia/Yekaterinburg",
  });
  await ctx.addCookies([{ name: "afisha_city", value: "ufa", url: STAND }]);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("afisha.cityAsked", "1");
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const go = async (url, ms) => {
    await page.goto(url, { waitUntil: "networkidle" });
    await settle(page, ms);
  };
  const step = async (name, fn) => {
    if (!want(name)) return;
    try {
      await fn();
      console.log(`ok ${name}`);
    } catch (e) {
      fail(name, e);
    }
  };

  await step("home", async () => {
    await go(`${STAND}/`);
    await page.screenshot({ path: OUT("home") });
  });
  await step("home-feed", async () => {
    await go(`${STAND}/`);
    await page.mouse.wheel(0, 640);
    await settle(page, 1500);
    await page.screenshot({ path: OUT("home-feed") });
  });
  await step("search", async () => {
    await go(`${STAND}/ru/search?q=${encodeURIComponent("спектакль")}`, 2000);
    await page.screenshot({ path: OUT("search") });
  });
  await step("event", async () => {
    await go(`${STAND}/e/${EVENT}`);
    await page.screenshot({ path: OUT("event") });
  });
  await step("passport", async () => {
    await go(`${STAND}/e/${EVENT}`);
    const box = page.locator("#passport");
    await box.scrollIntoViewIfNeeded();
    await settle(page, 800);
    await box.screenshot({ path: OUT("passport") });
  });
  await step("map", async () => {
    await go(`${STAND}/ru/m/ufa`, 3000);
    await page.screenshot({ path: OUT("map") });
  });
  await step("districts", async () => {
    await go(`${STAND}/ru/m`, 3000);
    await page.screenshot({ path: OUT("districts") });
  });
  await step("developers", async () => {
    await go(`${STAND}/ru/developers`, 2500);
    await page.screenshot({ path: OUT("developers") });
  });
  await step("api-docs", async () => {
    await page.goto("https://api.antihype.best/docs", { waitUntil: "networkidle" });
    await settle(page, 3000);
    await page.screenshot({ path: OUT("api-docs") });
  });
  await step("guide", async () => {
    await go(`${STAND}/ru/guide?q=${encodeURIComponent("куда пойти в субботу с ребёнком до 1000 рублей")}`, 500);
    // Гид может уточнить город — отвечаем кнопкой, как пользователь
    const ufa = page.getByRole("button", { name: /^Уфа$/ });
    const clarified = await ufa
      .first()
      .waitFor({ timeout: 45000 })
      .then(() => true)
      .catch(() => false);
    if (clarified) {
      await settle(page, 600);
      await page.screenshot({ path: OUT("guide-clarify") });
      await ufa.first().click();
    }
    await page.waitForFunction(() => document.querySelectorAll('[role="log"] a[href*="/e/"]').length > 0, null, {
      timeout: 90000,
    });
    await settle(page, 2500);
    await page.screenshot({ path: OUT("guide") });
    await page.screenshot({ path: OUT("guide-full"), fullPage: true });
  });
  await ctx.close();
}

// ---------- Телефон: сайт и Mini App ----------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    locale: "ru-RU",
    timezoneId: "Asia/Yekaterinburg",
  });
  await ctx.addCookies([{ name: "afisha_city", value: "ufa", url: STAND }]);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("afisha.cityAsked", "1");
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const m = async (name, url, ms = 2000, fn) => {
    if (!want(name)) return;
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      await settle(page, ms);
      if (fn) await fn();
      await page.screenshot({ path: OUT(name) });
      console.log(`ok ${name}`);
    } catch (e) {
      fail(name, e);
    }
  };
  await m("m-home", `${STAND}/`);
  await m("m-tma", `${STAND}/tma`, 2500);
  await m("m-tma-feed", `${STAND}/tma`, 2500, async () => {
    await page.mouse.wheel(0, 520);
    await settle(page, 1200);
  });
  await m("m-event", `${STAND}/e/${EVENT}`);
  await m("m-tma-guide", `${STAND}/tma/guide?q=${encodeURIComponent("бесплатные концерты на выходных в Уфе")}`, 500, async () => {
    const ufa = page.getByRole("button", { name: /^Уфа$/ });
    if (await ufa.first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false)) await ufa.first().click();
    await page.waitForFunction(() => document.querySelectorAll('a[href*="/e/"]').length > 0, null, { timeout: 90000 });
    await settle(page, 2000);
  });
  await ctx.close();
}

// ---------- Админка ----------
if (TOKEN) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "ru-RU" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  try {
    await page.goto(`${ADMIN}/login`, { waitUntil: "networkidle" });
    await page.fill("input#token", TOKEN);
    await page.click("button[type=submit]");
    await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 });
    for (const [name, path] of [
      ["admin-pulse", "/"],
      ["admin-moderation", "/moderation"],
      ["admin-cabinet", "/cabinet"],
    ]) {
      if (!want(name)) continue;
      await page.goto(`${ADMIN}${path}`, { waitUntil: "networkidle" });
      await settle(page, 3000);
      await page.screenshot({ path: OUT(name) });
      console.log(`ok ${name}`);
    }
  } catch (e) {
    fail("admin", e);
  }
  await ctx.close();
}

await browser.close();
