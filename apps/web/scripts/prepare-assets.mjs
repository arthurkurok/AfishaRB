#!/usr/bin/env node
/**
 * Подготовка ассетов перед dev/build:
 *  1) актуальные CSS-переменные из packages/design-tokens (генератор на Node);
 *  2) бандл виджета apps/widget/dist/afisha.js → public/widget/v1/afisha.js — сайт раздаёт виджет сам
 *     (для конструктора на /developers и как CDN по умолчанию). Если виджет не собран — предупреждение.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");

execFileSync(process.execPath, [resolve(root, "packages/design-tokens/scripts/build.mjs")], { stdio: "inherit" });

const widget = resolve(root, "apps/widget/dist/afisha.js");
const target = resolve(here, "../public/widget/v1/afisha.js");
if (existsSync(widget)) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(widget, target);
  console.log("Виджет скопирован в public/widget/v1/afisha.js");
} else {
  console.warn(
    "⚠ apps/widget/dist/afisha.js не найден: соберите виджет (pnpm --filter @afisha/widget build), иначе предпросмотр на /developers покажет iframe-вариант.",
  );
}
