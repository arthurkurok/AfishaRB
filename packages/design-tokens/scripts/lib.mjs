/**
 * Общие функции генераторов дизайн-токенов.
 * Источник истины — packages/design-tokens/tokens.json (W3C DTCG, тёмная тема — в `$extensions.dark`).
 * Скрипты не имеют зависимостей: только Node.js.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readTokens() {
  return JSON.parse(readFileSync(resolve(ROOT, "tokens.json"), "utf8"));
}

/** Плоский список цветовых токенов: { name: "color-bg", light: "#F6F0E4", dark: "#16120F" | null }. */
export function colorTokens(tokens) {
  const out = [];
  const walk = (node, path) => {
    if (node && typeof node === "object" && "$value" in node) {
      if (node.$type === "color") {
        out.push({ name: path.join("-"), light: node.$value, dark: node.$extensions?.dark ?? null });
      }
      return;
    }
    for (const [key, child] of Object.entries(node ?? {})) {
      if (key.startsWith("$")) continue;
      walk(child, [...path, key]);
    }
  };
  walk(tokens.color, ["color"]);
  return out;
}

/** cubic-bezier(.2,.8,.2,1) → cubic-bezier(0.2, 0.8, 0.2, 1): так же, как отформатировал бы Biome. */
const normalizeCss = (v) =>
  v.replace(
    /\(([^)]*)\)/,
    (_, args) =>
      `(${args
        .split(",")
        .map((a) => a.trim().replace(/^\./, "0."))
        .join(", ")})`,
  );

const px = (n) => `${n}px`;
const rem = (n) => `${+(n / 16).toFixed(4)}rem`;

/** Нецветовые токены: шрифты, типографика, радиусы, отступы, движение, зоны касания. */
export function baseTokens(tokens) {
  const out = [];
  for (const [name, node] of Object.entries(tokens.font ?? {})) {
    const families = node.$value.map((f) => (/\s/.test(f) && !f.includes("(") ? `"${f}"` : f)).join(", ");
    out.push([`font-${name}`, families]);
  }
  for (const [name, t] of Object.entries(tokens.type ?? {})) {
    out.push([`type-${name}-size`, rem(t.size)]);
    out.push([`type-${name}-line`, rem(t.line)]);
    out.push([`type-${name}-weight`, String(t.weight)]);
    out.push([`type-${name}-family`, `var(--font-${t.family})`]);
  }
  for (const [name, v] of Object.entries(tokens.radius ?? {})) out.push([`radius-${name}`, px(v)]);
  for (const [name, v] of Object.entries(tokens.space ?? {})) out.push([`space-${name}`, px(v)]);
  for (const [name, v] of Object.entries(tokens.motion ?? {})) {
    out.push([`motion-${name}`, typeof v === "number" ? `${v}ms` : normalizeCss(v)]);
  }
  for (const [name, v] of Object.entries(tokens.touch ?? {})) out.push([`touch-${name}`, px(v)]);
  return out;
}

/** Цвета для тёмной темы: явное значение из `$extensions.dark`, иначе — светлое. */
export function darkValue(t) {
  return t.dark ?? t.light;
}

/** Относительная яркость и контраст по WCAG 2.2. */
export function luminance(hex) {
  const h = hex.replace("#", "");
  const ch = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
