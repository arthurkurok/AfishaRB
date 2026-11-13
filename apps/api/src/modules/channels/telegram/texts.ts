/** Тексты Telegram-бота. HTML-разметка Telegram: экранируем всё, что пришло из данных. */
import type { OccurrenceCard } from "@afisha/contract";
import { humanDate, humanTime, localParts } from "../../geo/index.js";

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const MENU = {
  today: "🎭 Сегодня",
  weekend: "📅 Выходные",
  guide: "✨ Подобрать",
  categories: "🗂 Категории",
  near: "📍 Рядом",
  favorites: "⭐ Избранное",
  settings: "⚙️ Настройки",
  app: "📱 Открыть афишу",
};

const STATUS: Record<string, string> = {
  rescheduled: "🔁 Перенесено",
  postponed: "⏸ Перенесено, дата уточняется",
  cancelled: "❌ Отменено",
  sold_out: "🎟 Билетов нет",
  unverified: "❓ Информация уточняется",
  ended: "Прошло",
};

export function cardCaption(c: OccurrenceCard, reason?: string): string {
  const s = new Date(c.starts_at);
  const when =
    c.is_range && c.ends_at
      ? `до ${humanDate(localParts(new Date(c.ends_at)).date, "ru", false)}`
      : `${humanDate(localParts(s).date)}, ${humanTime(s)}`;
  const price = c.event.price.is_free
    ? "вход свободный"
    : c.event.price.min
      ? `от ${Math.round(Number(c.event.price.min))} ₽`
      : "цена уточняется";
  const lines = [
    `<b>${escapeHtml(c.event.title)}</b> · ${c.event.age_rating}+`,
    STATUS[c.status] ? `<b>${STATUS[c.status]}</b>${c.status_reason ? ` — ${escapeHtml(c.status_reason)}` : ""}` : null,
    `🗓 ${when}${c.more_dates ? ` (ещё ${c.more_dates})` : ""}`,
    c.venue
      ? `📍 ${escapeHtml(c.venue.name)}${c.venue.municipality ? `, ${escapeHtml(c.venue.municipality)}` : ""}`
      : null,
    `💳 ${price}${c.event.pushkin_card ? " · Пушкинская карта" : ""}`,
    reason ? `\n<i>${escapeHtml(reason)}</i>` : null,
  ];
  return lines.filter(Boolean).join("\n").slice(0, 1000);
}

export const T = {
  welcome:
    "<b>Сәләм! Здравствуйте!</b>\nЯ Гид афиши культуры Башкортостана — пчела Бал. Подбираю только реальные события из официальных источников и честно говорю, если ничего нет.\n\n<i>Продолжая, вы соглашаетесь на обработку идентификатора чата для работы бота — подробнее /privacy.</i>\n\nВыберите язык:",
  askCity: "Где ищем события? Город можно поменять в настройках.",
  askCityBa: "Ҡайҙа саралар эҙләйбеҙ? Ҡаланы көйләүҙәрҙә алмаштырырға мөмкин.",
  ready:
    "Готово. Напишите своими словами, что ищете, например:\n<i>«куда пойти в субботу с ребёнком до 1000 рублей»</i>\nили выберите в меню ниже.",
  guideHint:
    "Опишите, что хотите: когда, с кем, бюджет, что нравится. Например: <i>«бесплатные концерты завтра вечером»</i>.",
  about:
    "<b>Афиша культуры Башкортостана</b>\nИсточники: PRO.Культура.РФ / Культура.РФ (официальные данные учреждений) и кабинеты учреждений. У каждой карточки на сайте есть «паспорт»: откуда данные и когда проверены.\nГид работает на GigaChat, но события не придумывает: карточки берутся только из базы, объяснения проверяются.\nКак работают рекомендации — на сайте, раздел «О проекте».",
  privacy:
    "Мы храним только идентификатор чата, выбранные язык и город, избранное — чтобы присылать уведомления об изменениях. Данные хранятся в России. Удалить всё: напишите /privacy_delete (будет реализовано в личном кабинете) или обратитесь по адресу из раздела «О проекте».",
};
