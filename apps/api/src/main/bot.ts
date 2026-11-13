/** Telegram-бот: long polling (через исходящий прокси, т.к. Telegram в РФ заблокирован). */
import { run } from "@grammyjs/runner";
import { getDb } from "../db/client.js";
import { config } from "../lib/config.js";
import { log } from "../lib/log.js";
import { createBot, setBotCommands } from "../modules/channels/telegram/bot.js";
import { processPendingChanges } from "../modules/notify/index.js";

if (!config.AFISHA_TELEGRAM_BOT_TOKEN) {
  log.error("Не задан AFISHA_TELEGRAM_BOT_TOKEN — получите токен у @BotFather и добавьте в .env");
  process.exit(1);
}
const db = getDb();
const bot = createBot(db, config.AFISHA_TELEGRAM_BOT_TOKEN);
await setBotCommands(bot).catch((err) => log.warn({ err: String(err) }, "setMyCommands failed"));
const runner = run(bot);
log.info("Telegram-бот запущен");

// Уведомления об изменениях избранного — в том же процессе бота
const timer = setInterval(async () => {
  try {
    const r = await processPendingChanges(db);
    if (r.changes) log.info(r, "notify.batch");
  } catch (err) {
    log.error({ err: String(err) }, "notify.failed");
  }
}, 10_000);

const stop = async () => {
  clearInterval(timer);
  await runner.stop();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
