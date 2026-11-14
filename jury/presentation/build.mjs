// Сборка презентации: deck.mjs → presentation/build/deck.html → afisha.pdf (Chromium из Playwright, без окон).
// Запуск: node jury/presentation/build.mjs [--png <каталог>] — с --png снимает каждый слайд для проверки.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deck } from "./deck.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
// Playwright и шрифты — из департамента веба.
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Афиша РБ</title>
<link rel="stylesheet" href="../fonts.css">
<link rel="stylesheet" href="../../../packages/design-tokens/generated/tokens.css">
<link rel="stylesheet" href="../deck.css">
<base href="../">
</head>
<body>
${deck()}
</body>
</html>`;

// Стили подключены до base, поэтому идут от файла deck.html; картинки в deck.mjs — от base (каталог presentation/).
const outDir = join(here, "build");
mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, "deck.html");
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const broken = await page.evaluate(() =>
    [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
  );
  if (broken.length) throw new Error(`не загрузились картинки: ${broken.join(", ")}`);

  const pngAt = process.argv.indexOf("--png");
  if (pngAt > 0) {
    const dir = resolve(process.argv[pngAt + 1]);
    mkdirSync(dir, { recursive: true });
    const slides = await page.$$(".slide");
    for (const [i, s] of slides.entries()) await s.screenshot({ path: join(dir, `slide-${String(i + 1).padStart(2, "0")}.png`) });
  }

  const pdf = join(here, "afisha.pdf");
  await page.pdf({ path: pdf, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
  console.log(`готово: ${pdf}`);
} finally {
  await browser.close();
}
