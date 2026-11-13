/**
 * Воркер: регулярные задачи на pg-boss (очередь и cron в той же PostgreSQL, docs/04-architecture.md §3, ADR-002).
 * Расписание переживает перезапуск, а одна и та же задача не выполняется двумя экземплярами одновременно.
 */
import { join } from "node:path";
import { PgBoss } from "pg-boss";
import { getDb } from "../db/client.js";
import { config } from "../lib/config.js";
import { log } from "../lib/log.js";
import { runDedup } from "../modules/dedup/index.js";
import { fetchRegion, loadCultureRu } from "../modules/ingestion/index.js";
import { markEnded, refreshDerived } from "../modules/lifecycle/index.js";

const db = getDb();
const raw = join(config.AFISHA_DATA_DIR, "raw", "culture_ru");
const TZ = config.AFISHA_REGION_TZ;

/** Имя очереди → расписание (cron в часовом поясе региона) и обработчик. */
const JOBS: Record<string, { cron: string; run: () => Promise<unknown> }> = {
  // Полная синхронизация источника: каждые 6 часов
  "sync-culture-ru": {
    cron: "15 */6 * * *",
    run: async () => {
      const fetched = await fetchRegion(raw, { concurrency: 6, maxAgeHours: 6 });
      const stats = await loadCultureRu(db, raw);
      const dedup = await runDedup(db);
      return { fetched, stats: { ...stats, errors: stats.errors.length }, dedup };
    },
  },
  // Прошедшие сеансы → ended: каждые 5 минут
  "lifecycle-mark-ended": { cron: "*/5 * * * *", run: async () => ({ ended: await markEnded(db) }) },
  // Свежесть, индекс полноты, поисковые поля: каждый час
  "lifecycle-refresh-derived": { cron: "40 * * * *", run: async () => refreshDerived(db) },
};

const boss = new PgBoss({ connectionString: config.AFISHA_DATABASE_URL, schema: "pgboss" });
boss.on("error", (err) => log.error({ err: String(err) }, "pgboss.error"));
await boss.start();

for (const [name, job] of Object.entries(JOBS)) {
  // singleton-политика: пока задача выполняется, новая копия в очередь не встаёт
  await boss.createQueue(name, { policy: "singleton" }).catch(() => undefined);
  await boss.schedule(name, job.cron, null, { tz: TZ });
  await boss.work(name, async () => {
    const t0 = Date.now();
    const result = await job.run();
    log.info({ job: name, ms: Date.now() - t0, result }, "worker.job_done");
    return result;
  });
}
log.info({ jobs: Object.keys(JOBS) }, "Воркер запущен (pg-boss)");

// Ручной запуск синхронизации: pnpm worker -- --sync-now
if (process.argv.includes("--sync-now")) await boss.send("sync-culture-ru", null);

const stop = async () => {
  await boss.stop({ graceful: true, timeout: 30_000 });
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
