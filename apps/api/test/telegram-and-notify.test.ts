/**
 * Telegram-бот на симулированных апдейтах (без сети) и сквозной сценарий:
 * учреждение отменяет сеанс → журнал изменений → подписчик получает уведомление в Telegram.
 */
import { sql } from "drizzle-orm";
import type { Update } from "grammy/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, type Db } from "../src/db/client.js";
import { createBot } from "../src/modules/channels/telegram/bot.js";
import { processPendingChanges } from "../src/modules/notify/index.js";
import { changeOccurrenceStatus } from "../src/modules/organizer/index.js";
import { at, fixture, nextSaturday, resetDb, seed } from "./helpers/db.js";

const sat = nextSaturday();
let db: Db;
const calls: { method: string; payload: Record<string, any> }[] = [];
const CHAT = 777001;

function makeBot() {
  const bot = createBot(db, "123:TEST");
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: "Афиша РБ",
    username: "tamasha_test_bot",
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: true,
    can_connect_to_business: false,
    has_main_web_app: false,
  } as never;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, any> });
    return {
      ok: true,
      result:
        method === "sendMessage" || method === "sendPhoto"
          ? { message_id: calls.length, date: 0, chat: { id: CHAT, type: "private" } }
          : true,
    } as never;
  });
  return bot;
}

let updateId = 1;
const msg = (text: string): Update => ({
  update_id: updateId++,
  message: {
    message_id: updateId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: CHAT, type: "private", first_name: "Айгуль" },
    from: { id: CHAT, is_bot: false, first_name: "Айгуль" },
    text,
    ...(text.startsWith("/")
      ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] }
      : {}),
  },
});
const press = (data: string): Update => ({
  update_id: updateId++,
  callback_query: {
    id: String(updateId),
    chat_instance: "x",
    data,
    from: { id: CHAT, is_bot: false, first_name: "Айгуль" },
    message: { message_id: 1, date: 0, chat: { id: CHAT, type: "private", first_name: "Айгуль" }, text: "x" },
  },
});
const sent = () => calls.filter((c) => c.method === "sendMessage" || c.method === "sendPhoto");
const textOf = (c: { payload: Record<string, any> }) => String(c.payload.text ?? c.payload.caption ?? "");

beforeAll(async () => {
  await resetDb();
  db = await seed([
    fixture("kid0", {
      title: "Спектакль «Буратино»",
      categories: ["theatre", "kids"],
      ageRating: 0,
      priceMin: "400.00",
      start: at(sat, "11:00"),
    }),
    fixture("kid6", {
      title: "Спектакль «Сказание о семи батырах»",
      categories: ["theatre", "kids"],
      ageRating: 6,
      priceMin: "300.00",
      start: at(sat, "12:00"),
    }),
  ]);
});
afterAll(() => closeDb());

describe("Telegram-бот", () => {
  it("онбординг: язык → город → меню", async () => {
    const bot = makeBot();
    await bot.handleUpdate(msg("/start"));
    expect(textOf(sent().at(-1)!)).toMatch(/Выберите язык/);
    await bot.handleUpdate(press("lang:ru"));
    expect(textOf(sent().at(-1)!)).toMatch(/Где ищем события/);
    await bot.handleUpdate(press("city:ufa"));
    expect(textOf(sent().at(-1)!)).toMatch(/Готово/);
    const p = (
      await db.execute(sql`SELECT lang, municipality_id, consent_at FROM profile WHERE external_id = ${String(CHAT)}`)
    ).rows[0] as Record<string, unknown>;
    expect(p).toMatchObject({ lang: "ru", municipality_id: "ufa" });
    expect(p.consent_at).not.toBeNull();
  });

  it("сценарий ТЗ: уточнение кнопками → карточки реальных событий с объяснениями", async () => {
    const bot = makeBot();
    calls.length = 0;
    await bot.handleUpdate(msg("Куда пойти в субботу с ребёнком до 1000 рублей"));
    const q = sent().at(-1)!;
    expect(textOf(q)).toMatch(/Сколько лет ребёнку/);
    const buttons = q.payload.reply_markup.inline_keyboard.flat() as { text: string; callback_data: string }[];
    const age35 = buttons.find((b) => b.text === "3–5 лет")!;
    calls.length = 0;
    await bot.handleUpdate(press(age35.callback_data));
    const all = sent().map(textOf).join("\n---\n");
    expect(all).toMatch(/Буратино/);
    expect(all).not.toMatch(/семи батырах/); // 6+ — не для пятилетнего
    expect(all).toMatch(/0\+/);
  });

  it("избранное: кнопка ☆ сохраняет подписку на изменения", async () => {
    const bot = makeBot();
    const ev = (await db.execute<{ id: string }>(sql`SELECT id FROM event WHERE title->>'ru' = 'Спектакль «Буратино»'`))
      .rows[0]!;
    await bot.handleUpdate(press(`fav:${ev.id}`));
    const n = (
      await db.execute(
        sql`SELECT count(*)::int AS n FROM favorite f JOIN profile p ON p.id = f.profile_id WHERE p.external_id = ${String(CHAT)}`,
      )
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
  });

  it("/cancel: Гид забывает диалог — новая конверсация, старые кнопки погашены", async () => {
    const bot = makeBot();
    calls.length = 0;
    // запись в assistant_trace вставляется асинхронно (fire-and-forget) — ждём появления
    const maxTraceId = async () =>
      Number((await db.execute<{ m: string }>(sql`SELECT max(id) AS m FROM assistant_trace`)).rows[0]?.m ?? 0);
    const nextTrace = async (afterId: number) => {
      for (let i = 0; i < 40; i++) {
        const r = (
          await db.execute<{ id: string; conversation_id: string }>(
            sql`SELECT id, conversation_id FROM assistant_trace WHERE id > ${afterId} ORDER BY id ASC LIMIT 1`,
          )
        ).rows[0];
        if (r) return r;
        await new Promise((res) => setTimeout(res, 25));
      }
      throw new Error("нет новой записи assistant_trace");
    };
    // запрос с уточнением — оставляет кнопки, привязанные к конверсации
    await bot.handleUpdate(msg("Куда пойти в субботу с ребёнком до 1000 рублей"));
    const q = sent().at(-1)!;
    const ageButton = (q.payload.reply_markup.inline_keyboard.flat() as { callback_data: string }[])[0]!;
    const since = await maxTraceId();
    const t1 = await nextTrace(since - 1);
    // сброс диалога
    await bot.handleUpdate(msg("/cancel"));
    expect(textOf(sent().at(-1)!)).toMatch(/заново/i);
    // кнопка-уточнение старого диалога больше не действует
    await bot.handleUpdate(press(ageButton.callback_data));
    expect(textOf(sent().at(-1)!)).toMatch(/устарела/);
    // новый запрос уходит в новую конверсацию (id в трассировке псевдонимизированы)
    await bot.handleUpdate(msg("что сегодня"));
    const t2 = await nextTrace(Number(t1.id));
    expect(t2.conversation_id).not.toBe(t1.conversation_id);
  });

  it("отмена в кабинете учреждения → уведомление подписчику в Telegram", async () => {
    makeBot(); // регистрирует транспорт telegram
    calls.length = 0;
    const occ = (
      await db.execute<{ id: string }>(
        sql`SELECT o.id FROM occurrence o JOIN event e ON e.id = o.event_id WHERE e.title->>'ru' = 'Спектакль «Буратино»'`,
      )
    ).rows[0]!;
    await changeOccurrenceStatus(db, {
      occurrenceId: occ.id,
      status: "cancelled",
      reason: "болезнь артиста",
      actor: "test",
    });
    const r = await processPendingChanges(db);
    expect(r.sent).toBe(1);
    const note = sent().at(-1)!;
    expect(note.payload.chat_id).toBe(CHAT);
    expect(textOf(note)).toMatch(/Отмена: «Спектакль «Буратино»».*отменено/s);
    expect(textOf(note)).toMatch(/болезнь артиста/);
    // повторный прогон не шлёт дубль
    const again = await processPendingChanges(db);
    expect(again.sent).toBe(0);
    // отменённое событие больше не попадает в подборки
    const status = (await db.execute(sql`SELECT status FROM occurrence WHERE id = ${occ.id}`)).rows[0] as {
      status: string;
    };
    expect(status.status).toBe("cancelled");
  });

  it("перенос создаёт новый сеанс и связь rescheduled_to", async () => {
    const occ = (
      await db.execute<{ id: string; starts_at: string }>(
        sql`SELECT o.id, o.starts_at FROM occurrence o JOIN event e ON e.id = o.event_id WHERE e.title->>'ru' LIKE '%батырах%'`,
      )
    ).rows[0]!;
    const res = await changeOccurrenceStatus(db, {
      occurrenceId: occ.id,
      status: "rescheduled",
      newStartsAt: at(sat, "16:00"),
      actor: "test",
    });
    expect(res?.status).toBe("rescheduled");
    expect(res?.rescheduled_to).toBeTruthy();
    const moved = (
      await db.execute(sql`SELECT status, previous_starts_at FROM occurrence WHERE id = ${res!.rescheduled_to}`)
    ).rows[0] as { status: string; previous_starts_at: string };
    expect(moved.status).toBe("scheduled");
    expect(new Date(moved.previous_starts_at).getTime()).toBe(new Date(occ.starts_at).getTime());
  });
});
