#!/usr/bin/env node
/** Бюджет размера виджета: dist/afisha.js ≤ 35 КБ gzip (docs/04-architecture.md). */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const LIMIT = 35 * 1024;
const file = new URL("../dist/afisha.js", import.meta.url);
const raw = readFileSync(file);
const gz = gzipSync(raw, { level: 9 }).length;
console.log(
  `afisha.js: ${(raw.length / 1024).toFixed(1)} КБ, gzip ${(gz / 1024).toFixed(1)} КБ (лимит ${LIMIT / 1024} КБ)`,
);
if (gz > LIMIT) {
  console.error("Превышен бюджет размера виджета.");
  process.exit(1);
}
