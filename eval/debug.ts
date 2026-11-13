/**
 * Отладка отдельных контрольных кейсов: полный ответ гида (kind, текст, слоты, relaxed).
 * Запуск: npx tsx debug.ts s05,m04,i01
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";
import pg from "pg";

const dataset = JSON.parse(readFileSync(new URL("./datasets/control.json", import.meta.url), "utf8")) as {
  fixed_now: string;
  cases: Array<{ id: string; group: string; text?: string; turns?: Array<{ text: string }> }>;
};
const NOW = new Date(dataset.fixed_now);
const REPO = resolve(import.meta.dirname, "../..");
const SRC_URL = process.env.AFISHA_DATABASE_URL ?? "postgres://afisha:afisha@localhost:55432/afisha";
const TMP_DB = `afisha_dbg_${process.pid}`;

const srcUrl = new URL(SRC_URL);
const srcName = srcUrl.pathname.slice(1);
const admin = new pg.Client({ connectionString: new URL("/postgres", srcUrl).toString() });
await admin.connect();
await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
  [srcName],
);
await admin.query(`CREATE DATABASE "${TMP_DB}" TEMPLATE "${srcName}"`);
const tmpUrl = new URL(`/${TMP_DB}`, srcUrl).toString();
await admin.end();
process.env.AFISHA_DATABASE_URL = tmpUrl;

const { getDb, closeDb } = await import("../apps/api/src/db/client.js");
const db = getDb();
const { handleAssistant } = await import("../apps/api/src/modules/assistant/index.js");

const only = process.argv[2]?.split(",") ?? ["s05"];
for (const id of only) {
  const c = dataset.cases.find((x) => x.id === id);
  if (!c) {
    console.log(`?? ${id}: нет такого кейса`);
    continue;
  }
  const turns = c.turns ?? (c.text ? [{ text: c.text }] : []);
  let convId: string | undefined;
  console.log(`\n===== ${id} (${c.group}) =====`);
  for (const t of turns) {
    const resp = await handleAssistant(db, { text: t.text, conversation_id: convId }, { channel: "control", now: NOW });
    convId = resp.conversation_id;
    console.log(`--- user: ${t.text}`);
    console.log(
      JSON.stringify(
        {
          kind: resp.kind,
          mode: resp.mode,
          clarify: resp.clarify,
          relaxed: resp.relaxed,
          slots: resp.slots,
          confirm: resp.confirm,
        },
        null,
        1,
      ),
    );
    console.log(`text: ${resp.text}`);
    console.log(
      `picks: ${resp.picks.map((p) => `${p.occurrence.event.title} · ${p.occurrence.starts_at.slice(0, 16)} · ${p.occurrence.event.price.is_free ? "бесплатно" : p.occurrence.event.price.min + "₽"} · ${p.occurrence.event.age_rating}+`).join(" | ")}`,
    );
    if (resp.trace) console.log(`trace: ${resp.trace.steps?.map((s: { tool: string }) => s.tool).join(" → ")}`);
  }
}

await closeDb();
const admin2 = new pg.Client({ connectionString: new URL("/postgres", srcUrl).toString() });
await admin2.connect();
await admin2.query(`DROP DATABASE IF EXISTS "${TMP_DB}" WITH (FORCE)`);
await admin2.end();
void sql;
process.exit(0);
