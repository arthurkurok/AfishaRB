/** Служебные команды: `pnpm --filter @afisha/api cli <команда>`. */
import { readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../db/client.js";
import { config } from "../lib/config.js";
import { log } from "../lib/log.js";
import { revalidateMerges, runDedup } from "../modules/dedup/index.js";
import { fetchBashopera, fetchRegion, importFile, loadBashopera, loadCultureRu } from "../modules/ingestion/index.js";

const rawDir = join(config.AFISHA_DATA_DIR, "raw", "culture_ru");
const rawBashopera = join(config.AFISHA_DATA_DIR, "raw", "bashopera");

const commands: Record<string, (args: string[]) => Promise<unknown>> = {
  "db:migrate": async () => {
    await migrate(getDb(), { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    return "миграции применены";
  },
  "ingest:fetch": async (args) =>
    fetchRegion(rawDir, { maxPages: args[0] ? Number(args[0]) : undefined, concurrency: 6 }),
  "ingest:load": async (args) => {
    const force = args.includes("--force");
    const n = args.find((a) => /^\d+$/.test(a));
    const stats = await loadCultureRu(getDb(), rawDir, n ? Number(n) : undefined, force);
    const dedup = await runDedup(getDb());
    return { stats: { ...stats, errors: stats.errors.slice(0, 5) }, dedup };
  },
  "ingest:sync": async () => {
    const fetched = await fetchRegion(rawDir, { concurrency: 6 });
    const stats = await loadCultureRu(getDb(), rawDir);
    return { fetched, stats: { ...stats, errors: stats.errors.slice(0, 5) }, dedup: await runDedup(getDb()) };
  },
  // Афиша Башоперы (второй источник, ТЗ уровень 4): снимок → каталог → дедупликация
  "ingest:bashopera": async () => {
    const fetched = await fetchBashopera(rawBashopera);
    const stats = await loadBashopera(getDb(), rawBashopera);
    return { fetched, stats: { ...stats, errors: stats.errors.slice(0, 5) }, dedup: await runDedup(getDb()) };
  },
  "import:file": async (args) => {
    const dryRun = args.includes("--dry-run");
    const path = args.find((a) => !a.startsWith("--"));
    if (!path) throw new Error("использование: cli import:file <путь к CSV или JSON-файлу> [--dry-run]");
    const content = await readFile(path, "utf8");
    return importFile(getDb(), { content, filename: basename(path), dryRun });
  },
  dedup: async () => runDedup(getDb()),
  "dedup:revalidate": async () => revalidateMerges(getDb()),
  "openapi:export": async () => {
    const { exportOpenApi } = await import("./openapi.js");
    return exportOpenApi();
  },
};

const [cmd, ...args] = process.argv.slice(2);
const fn = cmd ? commands[cmd] : undefined;
if (!fn) {
  console.log(`Команды: ${Object.keys(commands).join(", ")}`);
  process.exit(cmd ? 1 : 0);
}
try {
  const result = await fn(args);
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
} catch (err) {
  log.error(err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
