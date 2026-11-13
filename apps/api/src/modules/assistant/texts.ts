/** Тексты Гида: шаблонные объяснения, чипы, подсказки (голос бренда — docs/07-design.md §10). */
import type { CategoryCode, OccurrenceCard, ReasonCode, SlotChip, Slots } from "@afisha/contract";
import { CATEGORIES } from "../catalog/index.js";
import { humanDate, humanTime, localParts } from "../geo/index.js";

type Lang = "ru" | "ba";

const TYPE_WORD: Record<CategoryCode, string> = {
  theatre: "Спектакль",
  music: "Концерт",
  museum: "Выставка",
  kids: "Для детей",
  folk: "Праздник",
  cinema: "Кино",
  education: "Встреча",
};

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export function priceText(c: OccurrenceCard): string {
  if (c.event.price.is_free) return "вход свободный";
  if (c.event.price.min) return `от ${Math.round(Number(c.event.price.min))} ₽`;
  return "цена уточняется";
}

export function whenText(c: OccurrenceCard): string {
  const s = new Date(c.starts_at);
  if (c.is_range && c.ends_at) return `до ${humanDate(localParts(new Date(c.ends_at)).date, "ru", false)}`;
  return `${humanDate(localParts(s).date, "ru", true).toLowerCase()} в ${humanTime(s)}`;
}

/** Шаблонное объяснение — всегда проходит верификатор, т.к. строится только из фактов карточки. */
export function templateReason(c: OccurrenceCard, codes: ReasonCode[], slots: Slots): string {
  const parts: string[] = [];
  const kind = c.event.categories.find((x) => x !== "kids") ?? c.event.categories[0] ?? "education";
  if (codes.includes("age_fit") && slots.kids_ages.length) parts.push(`${c.event.age_rating}+ — подходит по возрасту`);
  else parts.push(`${TYPE_WORD[kind]}, ${c.event.age_rating}+`);
  parts.push(whenText(c));
  if (c.event.price.is_free) parts.push("вход свободный");
  else if (codes.includes("budget_fit") && c.event.price.min)
    parts.push(`от ${Math.round(Number(c.event.price.min))} ₽ — в бюджете`);
  else parts.push(priceText(c));
  if (codes.includes("near") && c.distance_km !== null)
    parts.push(`${String(c.distance_km).replace(".", ",")} км от вас`);
  if (c.event.pushkin_card && (slots.pushkin || codes.includes("pushkin"))) parts.push("по Пушкинской карте");
  if (c.event.tags.includes("on_bashkir")) parts.push("на башкирском языке");
  const s = parts.join(", ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}

export function summaryText(n: number, slots: Slots, relaxed: string[], lang: Lang = "ru"): string {
  if (lang === "ba") {
    if (n === 0)
      return "Әлегә бындай саралар юҡ — уйлап сығармайым. Был һорау буйынса яңылары барлыҡҡа килһә, хәбәр итә алам.";
    const where = slots.municipality_label ? ` — ${slots.municipality_label}` : "";
    return `${n} вариант таптым${where}.${relaxed.length ? " Теүәл тап килгәндәре булманы, шуға шарттарҙы киңәйттем." : ""}`;
  }
  if (n === 0)
    return "Пока таких событий нет — ни одного не придумаю. Могу подписать вас на этот запрос: сообщу, как только появится.";
  const where = slots.municipality_label
    ? ` — ${slots.municipality_label}`
    : slots.near_me
      ? " рядом с вами"
      : " по республике";
  const when = slots.date_label ? `${slots.date_label}` : "ближайшие дни";
  const head = `Нашёл ${n} ${plural(n, "вариант", "варианта", "вариантов")}: ${when}${where}.`;
  return relaxed.length ? `${head} Точных совпадений не было, поэтому ${relaxed.join(", ")}.` : head;
}

const BA_LABELS: Record<string, string> = {
  "ближайшая неделя": "яҡын аҙна",
  "ближайший месяц": "яҡын ай",
  "вся республика": "бөтә республика",
  "эта неделя": "ошо аҙна",
  "следующая неделя": "киләһе аҙна",
};

/** Чипы понимания запроса на языке ответа. municipalityBa — башкирское название выбранного муниципалитета. */
export function chipsFor(s: Slots, lang: "ru" | "ba" = "ru", municipalityBa: string | null = null): SlotChip[] {
  const ba = lang === "ba";
  const chips: SlotChip[] = [];
  const add = (slot: string, label: string, source: SlotChip["source"], clear: Record<string, unknown> | null) =>
    chips.push({ slot, label, source, clear });
  if (s.date_label) {
    let label = s.date_label;
    if (ba) {
      if (BA_LABELS[label]) label = BA_LABELS[label]!;
      else if (s.date_from && s.date_to && s.date_from !== s.date_to)
        label = `${humanDate(s.date_from, "ba", false)} — ${humanDate(s.date_to, "ba", false)}`;
      else if (s.date_from) label = humanDate(s.date_from, "ba");
    }
    add(
      "date",
      label,
      s.date_source ?? "user",
      s.date_source === "default" ? null : { date_from: null, date_to: null, date_label: null, date_source: null },
    );
  }
  if (s.time_of_day.length) {
    const tod = ba
      ? { morning: "иртә", day: "көндөҙ", evening: "кис" }
      : { morning: "утро", day: "день", evening: "вечер" };
    add("time_of_day", s.time_of_day.map((x) => tod[x]).join(", "), "user", { time_of_day: [] });
  }
  if (s.municipality_label) {
    const label = ba
      ? (BA_LABELS[s.municipality_label] ?? municipalityBa ?? s.municipality_label)
      : s.municipality_label;
    add("municipality", label, s.municipality_source ?? "user", {
      municipality_id: null,
      municipality_label: "вся республика",
      municipality_source: "user",
    });
  } else if (s.near_me) add("near", ba ? "минең янда" : "рядом со мной", "user", { near_me: false });
  if (s.with_kids) {
    const label = s.kids_ages.length
      ? ba
        ? `бала ${s.kids_ages.join(" һәм ")} йәш`
        : `ребёнок ${s.kids_ages.join(" и ")} ${plural(s.kids_ages.at(-1)!, "год", "года", "лет")}`
      : ba
        ? "бала менән"
        : "с ребёнком";
    add("kids", label, "user", { with_kids: false, kids_ages: [] });
  }
  if (s.free_only) add("budget", ba ? "бушлай" : "бесплатно", "user", { free_only: false });
  else if (s.budget !== null) {
    const per =
      s.budget_per === "total"
        ? ba
          ? " бөтәһенә"
          : " на всех"
        : s.budget_per === "ticket"
          ? ba
            ? " билет өсөн"
            : " за билет"
          : "";
    add("budget", ba ? `${s.budget} ₽-ға тиклем${per}` : `до ${s.budget} ₽${per}`, "user", {
      budget: null,
      budget_per: null,
    });
  }
  const catRu: Record<string, string> = {
    theatre: "театр",
    music: "музыка",
    museum: "музеи и выставки",
    kids: "детям",
    folk: "праздники",
    cinema: "кино",
    education: "лекции и встречи",
  };
  for (const c of s.categories) {
    const label = ba ? (CATEGORIES.find((x) => x.code === c)?.ba ?? c).toLowerCase() : (catRu[c] ?? c);
    add("category", label, "user", { categories: s.categories.filter((x) => x !== c) });
  }
  if (s.pushkin)
    add("pushkin", ba ? "Пушкин картаһы" : "Пушкинская карта", "user", {
      pushkin: false,
      tags: s.tags.filter((t) => t !== "pushkin"),
    });
  if (s.accessible) add("accessible", ba ? "үтемле мөхит" : "доступная среда", "user", { accessible: false });
  if (s.text) add("text", `«${s.text}»`, "user", { text: null });
  return chips;
}

export const HELP_TEXT =
  "Я Гид афиши культуры Башкортостана. Подбираю только реальные события из официальных источников — ничего не придумываю. Напишите своими словами, например: «куда пойти в субботу с ребёнком до 1000 рублей» или «бесплатные концерты в Стерлитамаке на выходных».";

export const OFFTOPIC_TEXT =
  "Я умею подбирать культурные события Башкортостана: спектакли, концерты, выставки, праздники. Расскажите, когда и где хотите сходить — подберу.";

export const HELP_TEXT_BA =
  "Мин — Башҡортостан мәҙәниәт афишаһының Гиды. Рәсми сығанаҡтарҙағы ысын сараларҙы ғына тәҡдим итәм, бер нәмәне лә уйлап сығармайым. Үҙ һүҙҙәрегеҙ менән яҙығыҙ, мәҫәлән: «шәмбе көнө балалар менән ҡайҙа барырға».";
export const OFFTOPIC_TEXT_BA =
  "Мин Башҡортостандың мәҙәни сараларын һайлауҙа ярҙам итәм: спектаклдәр, концерттар, күргәҙмәләр, байрамдар. Ҡасан һәм ҡайҙа барырға теләйһегеҙ — әйтегеҙ, һайлап бирәм.";
export const CLARIFY_AGE_BA = "Балағыҙға нисә йәш? Йәш сикләүе (0+, 6+, 12+) шуға бәйле.";
export const CLARIFY_CITY_BA = "Ҡайһы ҡалала йәки районда эҙләйек?";
