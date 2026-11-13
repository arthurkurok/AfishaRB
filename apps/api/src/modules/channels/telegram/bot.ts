/**
 * Telegram-бот (docs/03-functional-spec.md §3). Тонкий адаптер: вся логика — в Гиде, поиске и каталоге.
 * Telegram в РФ заблокирован, поэтому Bot API вызывается через исходящий прокси (AFISHA_TELEGRAM_PROXY).
 */
import { randomBytes } from "node:crypto";
import type { AssistantResponse, OccurrenceCard, QuickReply } from "@afisha/contract";
import { sql } from "drizzle-orm";
import { Bot, type Context, InlineKeyboard, Keyboard } from "grammy";
import type { InlineQueryResultArticle } from "grammy/types";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Db } from "../../../db/client.js";
import { config } from "../../../lib/config.js";
import { pseudonym } from "../../../lib/ids.js";
import { log } from "../../../lib/log.js";
import { handleAssistant } from "../../assistant/index.js";
import { getEventDetail } from "../../catalog/index.js";
import { CITY_ORDER } from "../../geo/index.js";
import { registerTransport, subscriptionTitle, subscriptionUrl } from "../../notify/index.js";
import { searchOccurrences } from "../../search/index.js";
import { cardCaption, escapeHtml, MENU, SUBS, T } from "./texts.js";

type Profile = {
  id: string;
  lang: "ru" | "ba";
  municipality_id: string | null;
  consent_at: string | null;
  personalization: boolean;
};

/** Нажатия кнопок с «патчами» слотов: callback_data ≤ 64 байт, поэтому храним патч на сервере. */
const callbacks = new Map<string, { conv: string; patch: Record<string, unknown>; at: number }>();
function cb(conv: string, patch: Record<string, unknown>): string {
  const id = randomBytes(6).toString("base64url");
  callbacks.set(id, { conv, patch, at: Date.now() });
  if (callbacks.size > 20_000) {
    const cutoff = Date.now() - 6 * 3600_000;
    for (const [k, v] of callbacks) if (v.at < cutoff) callbacks.delete(k);
  }
  return `p:${id}`;
}

async function getProfile(db: Db, chatId: number): Promise<Profile> {
  const r = await db.execute<Profile>(sql`
    INSERT INTO profile (channel, external_id, last_seen_at) VALUES ('telegram', ${String(chatId)}, now())
    ON CONFLICT (channel, external_id) DO UPDATE SET last_seen_at = now()
    RETURNING id, lang, municipality_id, consent_at, personalization`);
  return r.rows[0]!;
}

// Идентификатор диалога бота — HMAC от chat_id: не угадывается и не принимается публичным API (BL-8)
const conversationId = (chatId: number) => `tg-${pseudonym(String(chatId), "tg-conv")}`;

/** Кнопки категорий: подпись и код (шарятся поиском и подписками). */
const CAT_BUTTONS: [label: string, code: string][] = [
  ["🎭 Театр", "theatre"],
  ["🎵 Музыка", "music"],
  ["🖼 Музеи и выставки", "museum"],
  ["🧸 Детям", "kids"],
  ["🌾 Праздники", "folk"],
  ["🎬 Кино", "cinema"],
  ["📚 Лекции и встречи", "education"],
];

function proxyAgent() {
  const p = config.AFISHA_TELEGRAM_PROXY;
  if (!p) return undefined;
  return p.startsWith("socks") ? new SocksProxyAgent(p) : new HttpsProxyAgent(p);
}

export function webUrl(path: string): string {
  return `${config.AFISHA_PUBLIC_BASE_URL}${path}`;
}

function cardKeyboard(c: OccurrenceCard, fav: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.url("Подробнее", webUrl(`/e/${c.event.id}`));
  if (c.ticket_url && c.status !== "cancelled") kb.url("🎟 Билеты", c.ticket_url);
  kb.row().text(fav ? "★ В избранном" : "☆ В избранное", `${fav ? "unfav" : "fav"}:${c.event.id}`);
  return kb;
}

async function isFav(db: Db, profileId: string, eventId: string) {
  const r = await db.execute(sql`SELECT 1 FROM favorite WHERE profile_id = ${profileId} AND event_id = ${eventId}`);
  return r.rows.length > 0;
}

async function sendCard(ctx: Context, db: Db, profile: Profile, c: OccurrenceCard, reason?: string) {
  const caption = cardCaption(c, reason);
  const kb = cardKeyboard(c, await isFav(db, profile.id, c.event.id));
  const img = c.event.image?.url;
  if (img) {
    try {
      await ctx.replyWithPhoto(`${img}/w_800,h_450,c_fill`, { caption, parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      // картинка недоступна Telegram — шлём текстом
    }
  }
  await ctx.reply(caption, { parse_mode: "HTML", reply_markup: kb, link_preview_options: { is_disabled: true } });
}

async function renderAssistant(ctx: Context, db: Db, profile: Profile, r: AssistantResponse) {
  const chips = r.chips.length ? `\n<i>Понял так: ${r.chips.map((c) => escapeHtml(c.label)).join(" · ")}</i>` : "";
  if (r.kind === "clarify" && r.clarify) {
    const kb = new InlineKeyboard();
    r.clarify.options.forEach((o, i) => {
      kb.text(o.label, cb(r.conversation_id, o.patch));
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply(`${escapeHtml(r.text)}${chips}`, { parse_mode: "HTML", reply_markup: kb });
    return;
  }
  const banner =
    r.mode === "rules" && r.kind === "results" ? "\n<i>Умный подбор временно упрощён — показываю по фильтрам.</i>" : "";
  await ctx.reply(`${escapeHtml(r.text)}${chips}${banner}`, { parse_mode: "HTML" });
  for (const p of r.picks) await sendCard(ctx, db, profile, p.occurrence, p.reason_text);
  if (r.followups.length) {
    const kb = new InlineKeyboard();
    r.followups.forEach((f: QuickReply, i) => {
      kb.text(f.label, cb(r.conversation_id, f.patch));
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply("Ещё варианты:", { reply_markup: kb });
  }
  // ТЗ 7.3: сначала ответ, потом предложение сузить — вопрос с кнопками приходит вместе с результатами
  if (r.clarify) {
    const kb = new InlineKeyboard();
    r.clarify.options.forEach((o, i) => {
      kb.text(o.label, cb(r.conversation_id, o.patch));
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply(`Уточнить подборку: ${escapeHtml(r.clarify.question)}`, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }
}

async function cityKeyboard(db: Db, prefix = "city") {
  const rows = (
    await db.execute<{ id: string; name: string }>(
      sql`SELECT id, name->>'ru' AS name FROM municipality WHERE id = ANY(${`{${CITY_ORDER.join(",")}}`}::text[])`,
    )
  ).rows;
  const byId = new Map(rows.map((r) => [r.id, r.name]));
  const kb = new InlineKeyboard();
  CITY_ORDER.filter((id) => byId.has(id))
    .slice(0, 8)
    .forEach((id, i) => {
      kb.text(byId.get(id)!, `${prefix}:${id}`);
      if (i % 2 === 1) kb.row();
    });
  return kb.row().text("Вся республика", `${prefix}:all`);
}

export function createBot(db: Db, token: string): Bot {
  /** Карточка события по ID: ближайший актуальный сеанс из «паспорта события». */
  const sendEventById = async (ctx: Context, profile: Profile, eventId: string) => {
    if (!/^[0-9a-f-]{36}$/.test(eventId)) return;
    const ev = await getEventDetail(db, eventId, profile.lang);
    if (!ev) return ctx.reply("Событие не найдено — возможно, оно уже прошло.");
    const occ = ev.occurrences.find((o) => o.status !== "ended") ?? ev.occurrences[0];
    if (!occ) return ctx.reply(`«${ev.title}» — сеансов больше нет.`);
    const {
      description_html: _d,
      images: _i,
      occurrences: _o,
      provenance: _p,
      history: _h,
      languages: _l,
      is_permanent: _ip,
      ticket_url: _t,
      accessibility: _a,
      source_url: _s,
      quality_score: _q,
      ...summary
    } = ev;
    await sendCard(ctx, db, profile, { ...occ, event: summary });
  };

  const agent = proxyAgent();
  const bot = new Bot(token, { client: agent ? { baseFetchConfig: { agent, compress: true } } : undefined });

  bot.catch((err) => log.error({ err: String(err.error) }, "telegram.error"));

  const menu = new Keyboard()
    .text(MENU.today)
    .text(MENU.weekend)
    .row()
    .text(MENU.guide)
    .text(MENU.categories)
    .row()
    .requestLocation(MENU.near)
    .text(MENU.favorites)
    .row()
    .text(MENU.subscriptions)
    .text(MENU.settings)
    .resized()
    .persistent();
  if (config.AFISHA_TELEGRAM_WEBAPP_URL) menu.row().webApp(MENU.app, config.AFISHA_TELEGRAM_WEBAPP_URL);

  bot.command("start", async (ctx) => {
    const profile = await getProfile(db, ctx.chat.id);
    const payload = ctx.match?.trim();
    if (payload?.startsWith("e_")) {
      await sendEventById(ctx, profile, payload.slice(2));
      return;
    }
    await ctx.reply(T.welcome, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("Русский", "lang:ru").text("Башҡортса", "lang:ba"),
    });
    if (!profile.consent_at) await db.execute(sql`UPDATE profile SET consent_at = now() WHERE id = ${profile.id}`);
  });

  bot.callbackQuery(/^lang:(ru|ba)$/, async (ctx) => {
    const lang = ctx.match[1] as "ru" | "ba";
    await db.execute(
      sql`UPDATE profile SET lang = ${lang} WHERE channel = 'telegram' AND external_id = ${String(ctx.chat!.id)}`,
    );
    await ctx.answerCallbackQuery();
    await ctx.reply(lang === "ba" ? T.askCityBa : T.askCity, { reply_markup: await cityKeyboard(db) });
  });

  bot.callbackQuery(/^city:(.+)$/, async (ctx) => {
    const id = ctx.match[1] === "all" ? null : ctx.match[1]!;
    await db.execute(
      sql`UPDATE profile SET municipality_id = ${id} WHERE channel = 'telegram' AND external_id = ${String(ctx.chat!.id)}`,
    );
    await ctx.answerCallbackQuery({ text: "Запомнил" });
    await ctx.reply(T.ready, { parse_mode: "HTML", reply_markup: menu });
  });

  const runQuery = async (ctx: Context, text: string) => {
    const profile = await getProfile(db, ctx.chat!.id);
    await ctx.replyWithChatAction("typing");
    const r = await handleAssistant(
      db,
      {
        conversation_id: conversationId(ctx.chat!.id),
        text,
        municipality_id: profile.municipality_id ?? undefined,
        lang: profile.lang,
      },
      { channel: "telegram" },
    );
    await renderAssistant(ctx, db, profile, r);
  };

  bot.command("today", (ctx) => runQuery(ctx, "что сегодня"));
  bot.command("weekend", (ctx) => runQuery(ctx, "на выходных"));
  bot.hears(MENU.today, (ctx) => runQuery(ctx, "что сегодня"));
  bot.hears(MENU.weekend, (ctx) => runQuery(ctx, "на выходных"));
  bot.hears(MENU.guide, (ctx) => ctx.reply(T.guideHint, { parse_mode: "HTML" }));
  bot.command(["help", "about"], (ctx) =>
    ctx.reply(T.about, { parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  );
  bot.command("privacy", (ctx) => ctx.reply(T.privacy, { parse_mode: "HTML" }));
  bot.command("nopersonal", async (ctx) => {
    await db.execute(
      sql`UPDATE profile SET personalization = false WHERE channel = 'telegram' AND external_id = ${String(ctx.chat.id)}`,
    );
    await ctx.reply(
      "Персонализация выключена: подборки строятся только по вашему запросу. Включить снова — /settings.",
    );
  });

  const categoriesKb = () => {
    const kb = new InlineKeyboard();
    CAT_BUTTONS.forEach(([label, code], i) => {
      kb.text(label, `cat:${code}`);
      if (i % 2 === 1) kb.row();
    });
    return kb;
  };
  /** Выбор категории для новой подписки: город уже выбран и «едет» в callback_data. */
  const subCatKb = (city: string) => {
    const kb = new InlineKeyboard();
    CAT_BUTTONS.forEach(([label, code], i) => {
      kb.text(label, `subcat:${city}|${code}`);
      if (i % 2 === 1) kb.row();
    });
    return kb.row().text(SUBS.catAll, `subcat:${city}|all`);
  };
  bot.hears(MENU.categories, (ctx) => ctx.reply("Что интересно?", { reply_markup: categoriesKb() }));
  const CAT_TEXT: Record<string, string> = {
    theatre: "спектакли",
    music: "концерты",
    museum: "выставки и музеи",
    kids: "для детей",
    folk: "праздники и фестивали",
    cinema: "кино",
    education: "лекции и встречи",
  };
  bot.callbackQuery(/^cat:(\w+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await runQuery(ctx, `${CAT_TEXT[ctx.match[1]!] ?? ""} на неделе`);
  });

  bot.on("message:location", async (ctx) => {
    const profile = await getProfile(db, ctx.chat.id);
    const { latitude, longitude } = ctx.message.location;
    const r = await handleAssistant(
      db,
      {
        conversation_id: conversationId(ctx.chat.id),
        text: "рядом сегодня и завтра",
        near: `${latitude},${longitude}`,
        lang: profile.lang,
      },
      { channel: "telegram" },
    );
    await renderAssistant(ctx, db, profile, r);
  });

  bot.hears(MENU.favorites, async (ctx) => {
    const profile = await getProfile(db, ctx.chat.id);
    const ids = (
      await db.execute<{ event_id: string }>(
        sql`SELECT event_id FROM favorite WHERE profile_id = ${profile.id} ORDER BY created_at DESC LIMIT 10`,
      )
    ).rows;
    if (!ids.length)
      return ctx.reply(
        "В избранном пока пусто. Нажмите ☆ под карточкой — и я сообщу, если событие перенесут или отменят.",
      );
    for (const { event_id } of ids) await sendEventById(ctx, profile, event_id);
  });

  /* ---------- Подписки на город и категорию (ТЗ: раздел 3) ---------- */

  type SubRow = {
    id: string;
    title: string;
    query: { municipality?: string | null; categories?: string[]; period?: string | null };
  };

  /** Экран «Подписки»: список + кнопки «Отписаться» на каждой + «Новая подписка». */
  const showSubscriptions = async (ctx: Context, profileId: string) => {
    const subs = (
      await db.execute<SubRow>(
        sql`SELECT id, title, query FROM saved_search WHERE profile_id = ${profileId} ORDER BY created_at`,
      )
    ).rows;
    const kb = new InlineKeyboard();
    if (subs.length === 0) {
      await ctx.reply(SUBS.empty, { reply_markup: kb.text("➕ Новая подписка", "sub:new") });
      return;
    }
    for (const s of subs) {
      kb.row()
        .url(
          s.title.slice(0, 40),
          subscriptionUrl(s.query.municipality ?? null, s.query.categories ?? [], s.query.period ?? null),
        )
        .text("Отписаться", `sub:del:${s.id}`);
    }
    kb.row().text("➕ Новая подписка", "sub:new");
    const lines = subs.map((s) => `• ${s.title}`).join("\n");
    await ctx.reply(`${SUBS.listTitle}\n${lines}`, {
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    });
  };

  bot.hears(MENU.subscriptions, async (ctx) => {
    const profile = await getProfile(db, ctx.chat.id);
    await showSubscriptions(ctx, profile.id);
  });

  // Отписка от всех подписок одной командой (ТЗ: «отписка одной командой»)
  bot.command("unsubscribe", async (ctx) => {
    const profile = await getProfile(db, ctx.chat.id);
    const deleted = (
      await db.execute<{ id: string }>(sql`DELETE FROM saved_search WHERE profile_id = ${profile.id} RETURNING id`)
    ).rows;
    await ctx.reply(deleted.length === 0 ? SUBS.none : SUBS.unsubscribed(deleted.length));
  });

  bot.callbackQuery("sub:new", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(SUBS.askCity, { reply_markup: await cityKeyboard(db, "subcity") });
  });

  bot.callbackQuery(/^subcity:([\w-]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(SUBS.askCat, { reply_markup: subCatKb(ctx.match[1]!) });
  });

  // город|категория → подписка; дубликат по тем же фильтрам не создаём
  bot.callbackQuery(/^subcat:([\w-]+)\|(\w+)$/, async (ctx) => {
    const cityId = ctx.match[1] === "all" ? null : ctx.match[1]!;
    const cat = ctx.match[2] === "all" ? null : ctx.match[2]!;
    const profile = await getProfile(db, ctx.chat!.id);
    if (!cityId && !cat) {
      await ctx.answerCallbackQuery();
      await ctx.reply(SUBS.needFilter, { reply_markup: await cityKeyboard(db, "subcity") });
      return;
    }
    const muniName = cityId
      ? ((await db.execute<{ name: string }>(sql`SELECT name->>'ru' AS name FROM municipality WHERE id = ${cityId}`))
          .rows[0]?.name ?? null)
      : null;
    const filters = { municipality: cityId, categories: cat ? [cat] : [], period: null };
    const title = subscriptionTitle(muniName, filters.categories);
    const created = (
      await db.execute<{ id: string }>(sql`
        INSERT INTO saved_search (profile_id, title, query)
        SELECT ${profile.id}, ${title}, ${JSON.stringify(filters)}::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM saved_search WHERE profile_id = ${profile.id} AND query = ${JSON.stringify(filters)}::jsonb)
        RETURNING id`)
    ).rows;
    await ctx.answerCallbackQuery();
    if (created.length === 0) {
      await ctx.reply(`Подписка «${title}» уже есть.`);
      return;
    }
    await ctx.reply(SUBS.created(title));
  });

  bot.callbackQuery(/^sub:del:([0-9a-f-]{36})$/, async (ctx) => {
    const profile = await getProfile(db, ctx.chat!.id);
    const deleted = (
      await db.execute<{ id: string }>(
        sql`DELETE FROM saved_search WHERE id = ${ctx.match[1]} AND profile_id = ${profile.id} RETURNING id`,
      )
    ).rows;
    await ctx.answerCallbackQuery({ text: deleted.length ? "Отписано" : "Уже отписано" });
    if (deleted.length) await showSubscriptions(ctx, profile.id);
  });

  bot.hears(MENU.settings, async (ctx) => {
    const kb = new InlineKeyboard()
      .text("🏙 Сменить город", "settings:city")
      .row()
      .text("Русский", "lang:ru")
      .text("Башҡортса", "lang:ba")
      .row()
      .text("Без персонализации", "settings:nopersonal");
    await ctx.reply("Настройки:", { reply_markup: kb });
  });
  bot.callbackQuery("settings:city", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(T.askCity, { reply_markup: await cityKeyboard(db) });
  });
  bot.callbackQuery("settings:nopersonal", async (ctx) => {
    await db.execute(
      sql`UPDATE profile SET personalization = false WHERE channel = 'telegram' AND external_id = ${String(ctx.chat!.id)}`,
    );
    await ctx.answerCallbackQuery({ text: "Персонализация выключена" });
  });

  bot.callbackQuery(/^(fav|unfav):([0-9a-f-]{36})$/, async (ctx) => {
    const profile = await getProfile(db, ctx.chat!.id);
    const [, action, eventId] = ctx.match;
    if (action === "fav")
      await db.execute(
        sql`INSERT INTO favorite (profile_id, event_id) VALUES (${profile.id}, ${eventId}) ON CONFLICT DO NOTHING`,
      );
    else await db.execute(sql`DELETE FROM favorite WHERE profile_id = ${profile.id} AND event_id = ${eventId}`);
    await ctx.answerCallbackQuery({
      text: action === "fav" ? "В избранном. Сообщу об изменениях." : "Убрано из избранного",
    });
    const kb = ctx.callbackQuery.message?.reply_markup;
    if (kb) {
      const rows = kb.inline_keyboard.map((row) =>
        row.map((b) =>
          "callback_data" in b && b.callback_data?.startsWith(action!)
            ? {
                text: action === "fav" ? "★ В избранном" : "☆ В избранное",
                callback_data: `${action === "fav" ? "unfav" : "fav"}:${eventId}`,
              }
            : b,
        ),
      );
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: rows } }).catch(() => undefined);
    }
  });

  bot.callbackQuery(/^p:(.+)$/, async (ctx) => {
    const entry = callbacks.get(ctx.match[1]!);
    await ctx.answerCallbackQuery();
    if (!entry) return ctx.reply("Кнопка устарела — напишите запрос заново.");
    const profile = await getProfile(db, ctx.chat!.id);
    const r = await handleAssistant(
      db,
      {
        conversation_id: entry.conv,
        patch: entry.patch,
        municipality_id: profile.municipality_id ?? undefined,
        lang: profile.lang,
      },
      { channel: "telegram" },
    );
    await renderAssistant(ctx, db, profile, r);
  });

  // Inline-режим: @bot театр выходные — карточки в любой чат
  bot.on("inline_query", async (ctx) => {
    const q = ctx.inlineQuery.query.trim();
    const res = await searchOccurrences(db, { q: q || undefined, when: "week", limit: 20 } as never);
    const results: InlineQueryResultArticle[] = res.items.map((c) => ({
      type: "article",
      id: c.id.slice(0, 64),
      title: `${c.event.title} · ${c.event.age_rating}+`,
      description: `${c.starts_at.slice(8, 10)}.${c.starts_at.slice(5, 7)} ${c.starts_at.slice(11, 16)} · ${c.venue?.name ?? ""}`,
      thumbnail_url: c.event.image ? `${c.event.image.url}/w_200,h_200,c_fill` : undefined,
      input_message_content: { message_text: cardCaption(c), parse_mode: "HTML" },
      reply_markup: cardKeyboard(c, false),
    }));
    await ctx.answerInlineQuery(results, { cache_time: 60, is_personal: false });
  });

  // Любой другой текст — Гиду
  bot.on("message:text", (ctx) => runQuery(ctx, ctx.message.text));

  // Транспорт уведомлений
  registerTransport("telegram", async (n) => {
    try {
      // у дайджеста своя кнопка «Смотреть все» (n.url), у изменений — карточка события
      const url = n.url ?? (n.eventId ? webUrl(`/e/${n.eventId}`) : undefined);
      await bot.api.sendMessage(Number(n.externalId), n.text, {
        ...(url ? { reply_markup: new InlineKeyboard().url(n.urlLabel ?? "Открыть событие", url) } : {}),
      });
      return true;
    } catch (err) {
      log.warn({ err: String(err) }, "telegram.notify_failed");
      return false;
    }
  });

  return bot;
}

export async function setBotCommands(bot: Bot) {
  await bot.api.setMyCommands([
    { command: "today", description: "Что сегодня" },
    { command: "weekend", description: "На выходных" },
    { command: "help", description: "Что умеет Гид" },
    { command: "unsubscribe", description: "Отписаться от всех подписок" },
    { command: "privacy", description: "Персональные данные" },
    { command: "nopersonal", description: "Выключить персонализацию" },
  ]);
}
