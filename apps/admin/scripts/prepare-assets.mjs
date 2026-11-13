#!/usr/bin/env node
/** Перед dev/build: актуальные CSS-переменные из packages/design-tokens (тот же генератор, что у сайта). */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
execFileSync(process.execPath, [resolve(root, "packages/design-tokens/scripts/build.mjs")], { stdio: "inherit" });
