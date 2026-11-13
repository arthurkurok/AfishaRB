/**
 * Вопросы о конкретном событии (docs/05-ai-agent.md §2.8): ответ строится ТОЛЬКО из полей карточки и площадки.
 * Нет данных — так и говорим, и даём источник. Никаких догадок про парковку, гардероб и т.п.
 */
import type { EventDetail } from "@afisha/contract";
import { humanDate, humanTime, localParts } from "../geo/index.js";

type Lang = "ru" | "ba";

const has = (t: string, rx: RegExp) => rx.test(t);

export function answerEventQuestion(ev: EventDetail, question: string, lang: Lang = "ru"): string {
  const t = question.toLowerCase().replaceAll("ё", "е");
  const next = ev.occurrences.find((o) => o.status !== "ended" && o.status !== "cancelled") ?? ev.occurrences[0];
  const parts: string[] = [];
  const src = ev.provenance.sources[0];
  const noData =
    lang === "ba"
      ? `Карточкала был турала мәғлүмәт юҡ. Ойоштороусынан белешегеҙ${ev.organization ? `: ${ev.organization}` : ""}.`
      : `В карточке этого нет. Уточните у организатора${ev.organization ? ` (${ev.organization})` : ""}${src?.url ? `, источник: ${src.url}` : ""}.`;

  if (has(t, /когда|во сколько|время|дата|начал|ҡасан|нисәлә/u) && next) {
    const s = new Date(next.starts_at);
    parts.push(
      next.is_range && next.ends_at
        ? `Работает до ${humanDate(localParts(new Date(next.ends_at)).date, lang, false)}.`
        : `Ближайший сеанс: ${humanDate(localParts(s).date, lang)}, ${humanTime(s)}.`,
    );
    if (next.status !== "scheduled")
      parts.push(
        `Статус: ${next.status === "rescheduled" ? "перенесено" : next.status === "sold_out" ? "билетов нет" : next.status === "unverified" ? "информация уточняется" : next.status}.`,
      );
  }
  if (has(t, /сколько (длится|идет|идёт)|продолжительн|длительн/u) && next?.ends_at && !next.is_range) {
    const min = Math.round((new Date(next.ends_at).getTime() - new Date(next.starts_at).getTime()) / 60000);
    if (min > 0 && min < 600) parts.push(`По данным источника — около ${min} мин.`);
  }
  if (has(t, /сколько стоит|цен|билет|стоимост|бесплатн|хаҡ/u)) {
    if (ev.price.is_free) parts.push("Вход свободный.");
    else if (ev.price.min)
      parts.push(
        `Билеты от ${Math.round(Number(ev.price.min))} ₽${ev.price.max && ev.price.max !== ev.price.min ? ` до ${Math.round(Number(ev.price.max))} ₽` : ""}.`,
      );
    if (ev.pushkin_card) parts.push("Можно по Пушкинской карте.");
    if (ev.ticket_url && !ev.price.is_free) parts.push(`Купить: ${ev.ticket_url}`);
  }
  if (has(t, /пушкинск/u) && !parts.some((p) => p.includes("Пушкинск"))) {
    parts.push(
      ev.pushkin_card
        ? "Да, можно по Пушкинской карте."
        : "По данным источника, Пушкинская карта к этому событию не подключена.",
    );
  }
  if (has(t, /возраст|с ребенком|с детьми|детям|ребенку|можно ли|йәш/u)) {
    parts.push(
      `Возрастной знак: ${ev.age_rating}+${ev.age_rating === 0 ? " — без ограничений" : ` — для зрителей от ${ev.age_rating} лет`}.`,
    );
  }
  if (has(t, /где|адрес|как добраться|куда ехать|место|площадк|ҡайҙа/u) && next?.venue) {
    parts.push(`Место: ${next.venue.name}${next.venue.address ? `, ${next.venue.address}` : ""}.`);
  }
  if (has(t, /коляск|доступн|инвалид|пандус|слабовидящ|глух/u)) {
    parts.push(
      ev.tags.includes("accessible")
        ? "Учреждение отмечает условия доступной среды. Детали лучше уточнить по телефону площадки."
        : noData,
    );
  }
  if (has(t, /на башкирском|на каком языке|язык/u)) {
    parts.push(
      ev.languages.includes("ba") ? "Событие на башкирском языке." : "Язык события в карточке не указан отдельно.",
    );
  }
  return parts.length ? parts.join(" ") : noData;
}
