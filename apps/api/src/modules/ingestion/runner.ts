/**
 * Загрузка скачанных карточек Культура.РФ и афиши Башоперы в каталог.
 * - Загружаются ТОЛЬКО события из текущего списка источника (listed.json / снимок афиши):
 *   снятое с источника событие не «подтверждается» старым файлом карточки (замечание жюри BL-1).
 * - Время подтверждения — время скачивания карточки (mtime файла), а не время загрузки (MJ-5).
 * - Каждая запись — в своей точке сохранения: битая карточка не откатывает пачку (MJ-2).
 * - Если ошибок больше порога, детектор исчезновений не запускается и прогон не считается успешным.
 */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { log } from "../../lib/log.js";
import { refreshDerived } from "../lifecycle/index.js";
import { BASHOPERA_SOURCE_ID, parseAffiche } from "./normalize-bashopera.js";
import { normalizeCultureRu } from "./normalize-culture-ru.js";
import { CatalogWriter, emptyStats, ensureReference, finishRun, type IngestStats, startRun } from "./pipeline.js";

async function loadListed(rawDir: string): Promise<{ ids: number[]; items: Map<number, Record<string, unknown>> }> {
  const listedPath = join(rawDir, "listed.json");
  const listed = JSON.parse(await readFile(listedPath, "utf8")) as Record<string, string>;
  const ids = Object.keys(listed).map(Number);
  // Дополнительные поля списка (Пушкинская карта, доступность) — из страниц выдачи
  const items = new Map<number, Record<string, unknown>>();
  const { readdir } = await import("node:fs/promises");
  for (const f of (await readdir(join(rawDir, "pages"))).sort()) {
    const page = JSON.parse(await readFile(join(rawDir, "pages", f), "utf8")) as { items?: Record<string, unknown>[] };
    for (const item of page.items ?? []) items.set(Number(item._id), item);
  }
  return { ids, items };
}

/** Доля ошибок, выше которой прогон неполный: детектор исчезновений не запускается. */
const MAX_ERROR_SHARE = 0.01;

export async function loadCultureRu(db: Db, rawDir: string, limit?: number, force = false): Promise<IngestStats> {
  const { ids, items } = await loadListed(rawDir);
  const selected = limit ? ids.slice(0, limit) : ids;
  await ensureReference(db);
  const runId = await startRun(db, "culture_ru");
  const total = emptyStats();
  let missingCards = 0;
  let failed = false;
  try {
    for (let i = 0; i < selected.length; i += 150) {
      const chunk = selected.slice(i, i + 150);
      await db.transaction(async (tx) => {
        let writer = new CatalogWriter(tx, "culture_ru", runId, force);
        await writer.warm();
        for (const id of chunk) {
          const file = join(rawDir, "events", `${id}.json`);
          let raw: Record<string, unknown>;
          let observedAt: Date;
          try {
            raw = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
            observedAt = (await stat(file)).mtime;
          } catch {
            missingCards++; // в списке есть, карточку скачать не удалось — событие не подтверждено, но и не «исчезло»
            continue;
          }
          await tx.execute(sql`SAVEPOINT rec`);
          const logMark = writer.pendingLogs();
          try {
            const ne = normalizeCultureRu(raw, items.get(id) ?? null);
            if (!ne) {
              total.skippedOutsideRegion++;
            } else {
              await writer.upsert(ne, raw, observedAt);
            }
            await tx.execute(sql`RELEASE SAVEPOINT rec`);
          } catch (err) {
            await tx.execute(sql`ROLLBACK TO SAVEPOINT rec`);
            total.errors.push(`${id}: ${String(err).slice(0, 300)}`);
            // кэши писателя могли запомнить откатанные строки — пересоздаём, записи журнала этой карточки отбрасываем
            const keepLogs = writer.takeLogs(logMark);
            const stats = writer.stats;
            writer = new CatalogWriter(tx, "culture_ru", runId, force);
            Object.assign(writer.stats, stats);
            writer.restoreLogs(keepLogs);
            await writer.warm();
          }
        }
        await writer.flushLogs();
        const acc = total as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(writer.stats)) if (typeof v === "number") acc[k] = (acc[k] ?? 0) + v;
      });
      log.info(
        {
          done: Math.min(i + 150, selected.length),
          of: selected.length,
          new: total.eventsNew,
          errors: total.errors.length,
        },
        "ingest.progress",
      );
    }
  } catch (err) {
    failed = true;
    total.errors.push(`run: ${String(err).slice(0, 300)}`);
    throw err;
  } finally {
    const errorShare = selected.length ? (total.errors.length + missingCards) / selected.length : 1;
    const complete = !limit && errorShare <= MAX_ERROR_SHARE;
    if (!complete && !limit)
      log.warn({ errors: total.errors.length, missingCards }, "ingest.incomplete_run_skip_vanish_detection");
    await finishRun(db, "culture_ru", runId, total, complete, failed);
    if (!failed) await refreshDerived(db);
  }
  return total;
}

/**
 * Загрузка афиши Башоперы (второй источник, ТЗ уровень 4): снимок data/raw/bashopera/affiche.html → каталог.
 * Снимок — полный срез «ближайших» событий театра, поэтому прогон считается полным и детектор
 * исчезновений работает. Нет снимка или неузнаваемая вёрстка — честный сбой прогона (MJ-2).
 */
export async function loadBashopera(db: Db, rawDir: string, limit?: number, force = false): Promise<IngestStats> {
  const file = join(rawDir, "affiche.html");
  const total = emptyStats();
  const parsed: ReturnType<typeof parseAffiche> = [];
  let failed = false;
  await ensureReference(db);
  const runId = await startRun(db, BASHOPERA_SOURCE_ID);
  try {
    const html = await readFile(file, "utf8");
    const observedAt = (await stat(file)).mtime; // момент наблюдения источника (MJ-5)
    for (const p of parseAffiche(html, observedAt)) parsed.push(p);
    if (parsed.length === 0)
      throw new Error("bashopera: в афише не найдено ни одного события — вероятно, изменилась вёрстка");
    const selected = limit ? parsed.slice(0, limit) : parsed;
    for (let i = 0; i < selected.length; i += 150) {
      const chunk = selected.slice(i, i + 150);
      await db.transaction(async (tx) => {
        let writer = new CatalogWriter(tx, BASHOPERA_SOURCE_ID, runId, force);
        await writer.warm();
        for (const p of chunk) {
          await tx.execute(sql`SAVEPOINT rec`);
          const logMark = writer.pendingLogs();
          try {
            await writer.upsert(p.event, p.raw, observedAt);
            await tx.execute(sql`RELEASE SAVEPOINT rec`);
          } catch (err) {
            await tx.execute(sql`ROLLBACK TO SAVEPOINT rec`);
            total.errors.push(`${p.event.externalId}: ${String(err).slice(0, 300)}`);
            // кэши писателя могли запомнить откатанные строки — пересоздаём, записи журнала этой карточки отбрасываем
            const keepLogs = writer.takeLogs(logMark);
            const stats = writer.stats;
            writer = new CatalogWriter(tx, BASHOPERA_SOURCE_ID, runId, force);
            Object.assign(writer.stats, stats);
            writer.restoreLogs(keepLogs);
            await writer.warm();
          }
        }
        await writer.flushLogs();
        const acc = total as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(writer.stats)) if (typeof v === "number") acc[k] = (acc[k] ?? 0) + v;
      });
      log.info(
        { done: Math.min(i + 150, selected.length), of: selected.length, errors: total.errors.length },
        "ingest.bashopera_progress",
      );
    }
  } catch (err) {
    failed = true;
    total.errors.push(`run: ${String(err).slice(0, 300)}`);
    throw err;
  } finally {
    const errorShare = parsed.length ? total.errors.length / parsed.length : 1;
    const complete = !limit && !failed && errorShare <= MAX_ERROR_SHARE;
    if (!complete && !limit && !failed)
      log.warn({ errors: total.errors.length }, "ingest.incomplete_run_skip_vanish_detection");
    await finishRun(db, BASHOPERA_SOURCE_ID, runId, total, complete, failed);
    if (!failed) await refreshDerived(db);
  }
  return total;
}
