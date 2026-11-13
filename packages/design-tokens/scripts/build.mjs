#!/usr/bin/env node
/**
 * Генератор CSS custom properties и TS-констант из tokens.json.
 *
 *   node scripts/build.mjs          — записать generated/tokens.css и generated/tokens.ts
 *   node scripts/build.mjs --check  — проверить, что сгенерированные файлы не устарели (для CI и `pnpm test`)
 *
 * Имена переменных: color.category.theatre → --color-category-theatre, type.h1.size → --type-h1-size.
 * Тёмная тема включается атрибутом data-theme="dark" на <html> или системной настройкой, если не выбран data-theme="light".
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { baseTokens, colorTokens, darkValue, ROOT, readTokens } from "./lib.mjs";

const HEADER = "Сгенерировано packages/design-tokens/scripts/build.mjs из tokens.json — не править вручную.";

function cssBlock(selector, entries, indent = "") {
  const body = entries.map(([k, v]) => `${indent}  --${k}: ${v};`).join("\n");
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

export function renderCss(tokens) {
  const colors = colorTokens(tokens);
  const light = colors.map((t) => [t.name, t.light.toLowerCase()]);
  const dark = colors.filter((t) => t.dark && t.dark !== t.light).map((t) => [t.name, darkValue(t).toLowerCase()]);
  const base = baseTokens(tokens);
  // Производный токен: текст на цветах категорий — всегда белый (07-design §4.2), в обеих темах.
  const onCategory = ["color-on-category", colors.find((t) => t.name === "color-surface").light.toLowerCase()];
  return [
    `/* ${HEADER} */`,
    "",
    cssBlock(":root", [...light, onCategory, ...base, ["color-scheme-name", "light"]]).replace(
      "  --color-scheme-name: light;",
      "  color-scheme: light;",
    ),
    "",
    cssBlock(':root[data-theme="dark"]', dark).replace(/\n}$/, "\n  color-scheme: dark;\n}"),
    "",
    "@media (prefers-color-scheme: dark) {",
    cssBlock(':root:not([data-theme="light"])', dark, "  ").replace(/\n {2}}$/, "\n    color-scheme: dark;\n  }"),
    "}",
    "",
  ].join("\n");
}

export function renderTs(tokens) {
  const colors = colorTokens(tokens);
  // Строки в стиле Biome: двойные кавычки, одинарные — если внутри есть двойные.
  const str = (v) => (v.includes('"') ? `'${v}'` : JSON.stringify(v));
  const obj = (entries) => `{\n${entries.map(([k, v]) => `  "--${k}": ${str(v)},`).join("\n")}\n}`;
  const white = colors.find((t) => t.name === "color-surface").light;
  const light = [...colors.map((t) => [t.name, t.light]), ["color-on-category", white]];
  const dark = [...colors.map((t) => [t.name, darkValue(t)]), ["color-on-category", white]];
  const raw = Object.fromEntries(colors.map((t) => [t.name, { light: t.light, dark: darkValue(t) }]));
  return [
    `/* ${HEADER} */`,
    "",
    "/** CSS-переменные светлой темы (цвета). */",
    `export const lightVars = ${obj(light)} as const;`,
    "",
    "/** CSS-переменные тёмной темы (цвета). */",
    `export const darkVars = ${obj(dark)} as const;`,
    "",
    "/** Нецветовые переменные: шрифты, типографика, радиусы, отступы, движение. */",
    `export const baseVars = ${obj(baseTokens(tokens))} as const;`,
    "",
    "/** Значения цветов для мест, где CSS-переменные недоступны (OG-картинки, SVG-файлы). */",
    `export const colors = {\n${Object.entries(raw)
      .map(([k, v]) => `  "${k}": { light: "${v.light}", dark: "${v.dark}" },`)
      .join("\n")}\n} as const;`,
    "",
    "export type ColorName = keyof typeof colors;",
    "",
  ].join("\n");
}

const tokens = readTokens();
const outputs = [
  [resolve(ROOT, "generated/tokens.css"), renderCss(tokens)],
  [resolve(ROOT, "generated/tokens.ts"), renderTs(tokens)],
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([file, content]) => {
    try {
      return readFileSync(file, "utf8") !== content;
    } catch {
      return true;
    }
  });
  if (stale.length) {
    console.error(
      `Устарели сгенерированные файлы — запустите pnpm --filter @afisha/design-tokens build:\n${stale.map(([f]) => `  ${f}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`Токены актуальны: ${outputs.length} файлов.`);
} else {
  for (const [file, content] of outputs) writeFileSync(file, content);
  console.log(`Сгенерировано ${outputs.length} файлов из tokens.json.`);
}
