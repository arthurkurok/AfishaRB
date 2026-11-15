// Сборка презентации: deck.mjs → build/deck.html → снимки слайдов build/slides/*.jpg (2×) → afisha.pdf.
// PDF собирается из снимков, поэтому выглядит одинаково в любом просмотрщике (Preview, Acrobat, браузер).
// Запуск: node jury/presentation/build.mjs [--png <каталог>] — с --png дополнительно кладёт PNG слайдов для проверки.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deck } from "./deck.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
// Playwright — из пакета веба.
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

/**
 * Листалка слайдов: только картинки, без заметок и счётчиков.
 * Вперёд: → ↓ Space Enter PageDown, клик по правой части, свайп влево. Назад: ← ↑ PageUp Backspace, клик слева.
 * Home/End — первый и последний слайд, F — полный экран, B или «.» — чёрный экран (как у пультов).
 * Номер слайда хранится в адресе (#3), перезагрузка страницы не сбрасывает показ.
 */
const presenter = (titles) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Афиша РБ</title>
<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: #f7f6f3; }
body { user-select: none; -webkit-user-select: none; touch-action: none; }
body.idle { cursor: none; }
img { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: contain; display: none; }
img.on { display: block; }
.black { position: fixed; inset: 0; background: #000; display: none; }
body.dark .black { display: block; }
</style>
</head>
<body>
${titles.map((t, i) => `<img src="slides/${String(i + 1).padStart(2, "0")}.jpg" alt="${t.replace(/"/g, "&quot;")}" draggable="false">`).join("\n")}
<div class="black"></div>
<script>
const slides = [...document.querySelectorAll("img")];
let cur = 0;
function show(n) {
  cur = Math.max(0, Math.min(slides.length - 1, n));
  slides.forEach((s, i) => s.classList.toggle("on", i === cur));
  history.replaceState(null, "", "#" + (cur + 1));
}
const next = () => show(cur + 1);
const prev = () => show(cur - 1);
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
}
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) next();
  else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) prev();
  else if (k === "Home") show(0);
  else if (k === "End") show(slides.length - 1);
  else if (k === "f" || k === "F" || k === "а" || k === "А") fullscreen();
  else if (k === "b" || k === "B" || k === "и" || k === "И" || k === ".") document.body.classList.toggle("dark");
  else return;
  e.preventDefault();
});
document.addEventListener("click", (e) => (e.clientX < innerWidth / 3 ? prev() : next()));
let x0 = null;
document.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
document.addEventListener("touchend", (e) => {
  if (x0 === null) return;
  const dx = e.changedTouches[0].clientX - x0;
  if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
  x0 = null;
});
let idle;
document.addEventListener("mousemove", () => {
  document.body.classList.remove("idle");
  clearTimeout(idle);
  idle = setTimeout(() => document.body.classList.add("idle"), 1500);
});
show((parseInt(location.hash.slice(1), 10) || 1) - 1);
</script>
</body>
</html>
`;

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
const slidesDir = join(outDir, "slides");
rmSync(slidesDir, { recursive: true, force: true });
mkdirSync(slidesDir, { recursive: true });
const htmlPath = join(outDir, "deck.html");
writeFileSync(htmlPath, html);

const pngAt = process.argv.indexOf("--png");
const pngDir = pngAt > 0 ? resolve(process.argv[pngAt + 1]) : null;
if (pngDir) mkdirSync(pngDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const broken = await page.evaluate(() =>
    [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
  );
  if (broken.length) throw new Error(`не загрузились картинки: ${broken.join(", ")}`);

  const slides = await page.$$(".slide");
  const files = [];
  for (const [i, s] of slides.entries()) {
    const name = `slide-${String(i + 1).padStart(2, "0")}`;
    const jpg = join(slidesDir, `${name}.jpg`);
    await s.screenshot({ path: jpg, type: "jpeg", quality: 90 });
    files.push(jpg);
    if (pngDir) await s.screenshot({ path: join(pngDir, `${name}.png`) });
  }

  // Веб-листалка: web/index.html + web/slides/*.jpg. Работает локально без сети и как статика на сайте.
  const titles = await page.$$eval(".slide", (els) => els.map((el) => el.querySelector("h1, h2")?.textContent?.trim() ?? "Афиша РБ"));
  const webDir = join(here, "web");
  rmSync(webDir, { recursive: true, force: true });
  mkdirSync(join(webDir, "slides"), { recursive: true });
  files.forEach((f, i) => copyFileSync(f, join(webDir, "slides", `${String(i + 1).padStart(2, "0")}.jpg`)));
  writeFileSync(join(webDir, "index.html"), presenter(titles));
  // Выкладка на https://antihype.best/pitch/: node jury/presentation/build.mjs --deploy
  // (Caddy отдаёт /pitch/ из /srv/afisha-pitch на сервере gvps, контейнер сайта не пересобирается)

  // Страница PDF = снимок слайда во весь лист 1920×1080
  const pdfHtml = join(outDir, "pdf.html");
  writeFileSync(
    pdfHtml,
    `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:1920px 1080px;margin:0}html,body{margin:0;padding:0}
img{display:block;width:1920px;height:1080px;break-after:page}img:last-child{break-after:auto}
</style></head><body>${files.map((f) => `<img src="${pathToFileURL(f).href}">`).join("")}</body></html>`,
  );
  const pdfPage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await pdfPage.goto(pathToFileURL(pdfHtml).href, { waitUntil: "load" });
  const pdf = join(here, "afisha.pdf");
  await pdfPage.pdf({ path: pdf, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
  console.log(`готово: ${pdf}, слайдов: ${files.length}`);
  if (process.argv.includes("--deploy")) {
    execFileSync("rsync", ["-a", "--delete", `${webDir}/`, "gvps:/srv/afisha-pitch/"], { stdio: "inherit" });
    execFileSync("ssh", ["gvps", "find /srv/afisha-pitch -type d -exec chmod 755 {} + ; find /srv/afisha-pitch -type f -exec chmod 644 {} +"], { stdio: "inherit" });
    console.log("выложено: https://antihype.best/pitch/");
  }
} finally {
  await browser.close();
}
