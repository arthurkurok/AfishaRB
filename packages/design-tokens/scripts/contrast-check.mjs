#!/usr/bin/env node
/**
 * Проверка контраста пар «текст/фон» из токенов по WCAG 2.2 AA (docs/07-design.md §4.1, §11).
 * Обычный текст ≥ 4,5:1; кольцо фокуса и границы элементов управления ≥ 3:1.
 * Запускается в `pnpm --filter @afisha/design-tokens test` и в корневом `pnpm check`.
 */
import { colorTokens, contrast, darkValue, readTokens } from "./lib.mjs";

const tokens = readTokens();
const byName = Object.fromEntries(colorTokens(tokens).map((t) => [t.name, t]));
const get = (name, theme) => {
  const t = byName[`color-${name}`];
  if (!t) throw new Error(`Нет токена color-${name}`);
  return theme === "dark" ? darkValue(t) : t.light;
};

/** [текст, фон, минимум, темы]. Категории: белый текст на цвете категории в обеих темах. */
const pairs = [
  ["ink", "bg", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "surface-2", 4.5],
  ["ink-2", "bg", 4.5],
  ["ink-2", "surface", 4.5],
  ["ink-2", "surface-2", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "surface", 4.5],
  ["on-accent", "accent", 4.5],
  ["meadow", "surface", 4.5],
  ["meadow", "bg", 4.5],
  ["ink", "honey", 4.5, ["light"]],
  ["focus", "bg", 3],
  ["focus", "surface", 3],
  ["status-rescheduled", "surface", 4.5],
  ["status-cancelled", "surface", 4.5],
  ["status-ended", "surface", 4.5],
  ["status-unverified", "surface", 4.5],
  ["line", "surface", 1],
];

const failures = [];
const rows = [];
for (const [fg, bg, min, themes = ["light", "dark"]] of pairs) {
  for (const theme of themes) {
    const ratio = contrast(get(fg, theme), get(bg, theme));
    rows.push(`${theme.padEnd(5)} ${fg.padEnd(20)} на ${bg.padEnd(10)} ${ratio.toFixed(2)}:1 (мин. ${min})`);
    if (ratio < min) failures.push(rows.at(-1));
  }
}
// Тёмный текст на шафране в тёмной теме: шафран остаётся фоном, текст — тёмный (ink светлой темы).
{
  const ratio = contrast(get("ink", "light"), get("honey", "dark"));
  rows.push(`dark  ink(light)           на honey      ${ratio.toFixed(2)}:1 (мин. 4.5)`);
  if (ratio < 4.5) failures.push(rows.at(-1));
}
for (const code of Object.keys(tokens.color.category)) {
  const ratio = contrast(get("surface", "light"), get(`category-${code}`, "light"));
  rows.push(`both  #FFF на category-${code.padEnd(10)} ${ratio.toFixed(2)}:1 (мин. 4.5)`);
  if (ratio < 4.5) failures.push(rows.at(-1));
}

if (process.argv.includes("--verbose")) console.log(rows.join("\n"));
if (failures.length) {
  console.error(`Контраст ниже нормы WCAG 2.2 AA:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Контраст токенов: ${rows.length} пар, все ≥ нормы WCAG 2.2 AA.`);
