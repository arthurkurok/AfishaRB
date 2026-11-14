/**
 * Коннектор публичной витрины Культура.РФ (данные PRO.Культура.РФ, «Типовые условия использования открытых данных»).
 * Временный источник до партнёрского ключа API PRO.Культура (docs/06-data.md §2.1).
 * Сохраняет сырые JSON в data/raw/culture_ru/{pages,events}. Идемпотентен и возобновляем.
 */

import { createHash } from "node:crypto";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "../../../lib/log.js";

const BASE = "https://www.culture.ru";
const UA = "Mozilla/5.0 (compatible; AfishaRB/0.1; culture-data-sync)";

export type FetchStats = {
  pages: number;
  listed: number;
  fetched: number;
  skipped: number;
  errors: number;
  archived: number;
};

class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CultureRuClient {
  buildId: string | null = null;
  /** Кука challenge-token после решения JS-челленджа Solar Space (защита от DDoS). */
  private cookie: string | null = null;
  private readonly limiter: Limiter;

  constructor(
    readonly locale = "respublika-bashkortostan",
    concurrency = 6,
  ) {
    this.limiter = new Limiter(concurrency);
  }

  private async get(path: string, params: Record<string, string | number> = {}): Promise<Response> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    let delay = 1000;
    let challenges = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      const headers: Record<string, string> = { "User-Agent": UA, Accept: "application/json, text/html" };
      if (this.cookie) headers.Cookie = this.cookie;
      const res = await this.limiter
        .run(async () => {
          const r = await fetch(url, { headers, redirect: "follow" });
          await sleep(200); // вежливость к источнику
          return r;
        })
        .catch((err: unknown) => {
          log.warn({ url: url.toString(), err: String(err), attempt }, "culture_ru.http_error");
          return null;
        });
      // Страница проверки Solar Space (HTTP 425, HTML с заданием): решаем PoW, как это делает браузер
      if (res && res.status === 425 && challenges < 3) {
        challenges++;
        try {
          await this.solveChallenge(res);
          continue; // повторяем запрос уже с кукой challenge_token
        } catch (err) {
          log.warn({ err: String(err), url: url.toString() }, "culture_ru.challenge_failed");
        }
      }
      if (res && res.status < 500 && res.status !== 429) return res;
      await sleep(delay);
      delay *= 2;
    }
    throw new Error(`culture.ru недоступен: ${url}`);
  }

  /**
   * JS-челлендж Solar Space: SHA-256 proof-of-work. Браузер ищет counter, при котором
   * sha256(nonce+counter) начинается с `difficulty` нулей, ждёт minTimeMs и ставит куку
   * `{cookieName}={counter},{hash},{difficulty}`. Повторяем тот же алгоритм на сервере.
   */
  private async solveChallenge(res: Response): Promise<void> {
    const html = await res.text();
    const cfg = /window\.__jc\s*=\s*\{([^}]*)\}/.exec(html)?.[1] ?? "";
    const nonce = /nonce\s*:\s*'([^']+)'/.exec(cfg)?.[1];
    const cookieName = /cookieName\s*:\s*'([^']+)'/.exec(cfg)?.[1];
    const difficulty = Number(/difficulty\s*:\s*(\d+)/.exec(cfg)?.[1]);
    const minTimeMs = Number(/minTimeMs\s*:\s*(\d+)/.exec(cfg)?.[1] ?? 3000);
    if (!nonce || !cookieName || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 6) {
      throw new Error(`culture.ru: нераспознанный формат challenge`);
    }
    const started = Date.now();
    const zeros = "0".repeat(difficulty);
    let counter = 0;
    let hash = "";
    while (counter < 2 ** 26) {
      hash = createHash("sha256").update(`${nonce}${counter}`).digest("hex");
      if (hash.startsWith(zeros)) break;
      counter++;
    }
    if (!hash.startsWith(zeros)) throw new Error("culture.ru: PoW не решён (превышен лимит попыток)");
    // задание требует ≥ minTimeMs между выдачей и ответом — уважаем это окно
    const wait = minTimeMs - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    this.cookie = `${cookieName}=${counter},${hash},${difficulty}`;
    log.info({ difficulty, counter, ms: Date.now() - started }, "culture_ru.challenge_solved");
  }

  async refreshBuildId(): Promise<string> {
    const html = await (await this.get(`/afisha/${this.locale}`)).text();
    const m = html.match(/"buildId":"([^"]+)"/);
    if (!m?.[1]) throw new Error("Не найден buildId Next.js на странице афиши");
    this.buildId = m[1];
    return this.buildId;
  }

  async listPage(page: number): Promise<{ items: Record<string, unknown>[]; pagination: { total: number } }> {
    if (!this.buildId) await this.refreshBuildId();
    let res = await this.get(`/_next/data/${this.buildId}/afisha/${this.locale}.json`, { locale: this.locale, page });
    if (res.status === 404) {
      await this.refreshBuildId(); // сайт передеплоили — сменился buildId
      res = await this.get(`/_next/data/${this.buildId}/afisha/${this.locale}.json`, { locale: this.locale, page });
    }
    if (!res.ok) throw new Error(`list page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as {
      pageProps: { events: { items: Record<string, unknown>[]; pagination: { total: number } } };
    };
    return body.pageProps.events;
  }

  async eventDetail(id: number, name: string): Promise<Record<string, unknown> | null> {
    if (!this.buildId) await this.refreshBuildId();
    const res = await this.get(`/_next/data/${this.buildId}/events/${id}/${name}.json`, {
      _id: id,
      name,
      location: this.locale,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`event ${id}: HTTP ${res.status}`);
    const body = (await res.json()) as { pageProps?: { event?: Record<string, unknown> } };
    return body.pageProps?.event ?? null;
  }
}

export async function fetchRegion(
  outDir: string,
  opts: { details?: boolean; maxPages?: number; maxAgeHours?: number; concurrency?: number } = {},
): Promise<FetchStats> {
  const { details = true, maxPages, maxAgeHours = 20, concurrency = 6 } = opts;
  const stats: FetchStats = { pages: 0, listed: 0, fetched: 0, skipped: 0, errors: 0, archived: 0 };
  const pagesDir = join(outDir, "pages");
  const eventsDir = join(outDir, "events");
  await mkdir(pagesDir, { recursive: true });
  await mkdir(eventsDir, { recursive: true });

  const client = new CultureRuClient("respublika-bashkortostan", concurrency);
  const first = await client.listPage(1);
  const total = Math.min(first.pagination.total, maxPages ?? Number.POSITIVE_INFINITY);
  log.info({ total, buildId: client.buildId }, "culture_ru.start");

  const listed = new Map<number, string>();
  await Promise.all(
    Array.from({ length: total }, (_, i) => i + 1).map(async (n) => {
      const data = n === 1 ? first : await client.listPage(n);
      await writeFile(join(pagesDir, `${String(n).padStart(4, "0")}.json`), JSON.stringify(data));
      for (const item of data.items) listed.set(Number(item._id), String(item.name));
      stats.pages++;
    }),
  );
  stats.listed = listed.size;
  await writeFile(join(outDir, "listed.json"), JSON.stringify(Object.fromEntries(listed)));
  // Карточки событий, которых больше нет в списке источника, убираем в архив: загрузчик видит только
  // актуальный список, а детектор исчезновений получает честный сигнал (замечание жюри BL-1)
  const archiveDir = join(outDir, "events-archive");
  await mkdir(archiveDir, { recursive: true });
  for (const f of await readdir(eventsDir)) {
    const id = Number(f.replace(/\.json$/, ""));
    if (f.endsWith(".json") && !listed.has(id)) {
      await rename(join(eventsDir, f), join(archiveDir, f));
      stats.archived++;
    }
  }
  // Страницы выдачи сверх текущего числа страниц — от прошлых прогонов
  for (const f of await readdir(pagesDir)) {
    if (Number(f.replace(/\.json$/, "")) > total) await rm(join(pagesDir, f));
  }
  if (!details) return stats;

  const existing = new Set(await readdir(eventsDir));
  const now = Date.now();
  await Promise.all(
    [...listed].map(async ([id, name]) => {
      const file = join(eventsDir, `${id}.json`);
      if (existing.has(`${id}.json`)) {
        const st = await stat(file);
        if (now - st.mtimeMs < maxAgeHours * 3600_000) {
          stats.skipped++;
          return;
        }
      }
      try {
        const ev = await client.eventDetail(id, name);
        if (!ev) {
          stats.errors++;
          return;
        }
        await writeFile(file, JSON.stringify(ev));
        stats.fetched++;
        if (stats.fetched % 250 === 0) log.info({ fetched: stats.fetched, of: listed.size }, "culture_ru.progress");
      } catch (err) {
        stats.errors++;
        log.warn({ id, err: String(err) }, "culture_ru.detail_error");
      }
    }),
  );
  log.info(stats, "culture_ru.done");
  return stats;
}
