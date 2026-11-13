import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { REPO_ROOT } from "../lib/config.js";
import { buildApp } from "./app.js";

/** Экспорт OpenAPI 3.1 в packages/contract/openapi.json (для генерации Swift/Kotlin клиентов и проверки дрейфа). */
export async function exportOpenApi(): Promise<string> {
  const app = await buildApp();
  await app.ready();
  const out = resolve(REPO_ROOT, "packages/contract/openapi.json");
  await writeFile(out, `${JSON.stringify(app.swagger(), null, 2)}\n`);
  await app.close();
  return `OpenAPI → ${out}`;
}
