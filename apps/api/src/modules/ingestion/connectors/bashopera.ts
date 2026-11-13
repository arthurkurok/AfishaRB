/**
 * Коннектор афиши Башкирского государственного театра оперы и балета (bashopera.ru/affiche/).
 * Второй внешний источник сбора (ТЗ уровень 4, docs/06-data.md §2): публичная страница
 * «Ближайшие спектакли» учреждения. Снимок сохраняется в data/raw/bashopera/affiche.html
 * и разбирается normalize-bashopera. При недоступности сайта — честная ошибка ингеста:
 * выдуманных событий нет.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../../../lib/log.js";

export const BASHOPERA_AFFICHE_URL = "https://bashopera.ru/affiche/";
const UA = "Mozilla/5.0 (compatible; AfishaRB/0.1; bashopera-affiche-sync)";
const ATTEMPTS = 3;

export type BashoperaFetchStats = { bytes: number; items: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Скачать страницу афиши в снимок. Ошибка — только ошибка: тихих пустых прогонов не бывает. */
export async function fetchBashopera(outDir: string): Promise<BashoperaFetchStats> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const res = await fetch(BASHOPERA_AFFICHE_URL, {
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      // страница должна быть узнаваемой: элементы расписания афиши
      const items = (html.match(/<div class="item content /g) ?? []).length;
      if (items === 0) throw new Error("на странице нет элементов расписания — не афиша?");
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, "affiche.html"), html);
      const stats: BashoperaFetchStats = { bytes: html.length, items };
      log.info(stats, "bashopera.fetch_done");
      return stats;
    } catch (err) {
      lastErr = err;
      log.warn({ attempt, err: String(err) }, "bashopera.http_error");
      if (attempt < ATTEMPTS - 1) await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error(`bashopera.ru недоступен: ${String(lastErr)}`);
}
