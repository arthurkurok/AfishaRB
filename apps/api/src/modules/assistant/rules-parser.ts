/**
 * Разбор свободного запроса на правилах (docs/05-ai-agent.md §2.3).
 * Работает без сети и без LLM; для дат, цен и возраста — главный источник истины (LLM их не считает).
 */
import type { CategoryCode, Slots, TagCode } from "@afisha/contract";
import { addDays, humanDate, type LocalDate, localParts, todayLocal, weekdayOf } from "../geo/index.js";
import { weekendRange } from "../search/index.js";

export type MunicipalityRef = {
  id: string;
  name: string;
  nameBa?: string | null;
  stems: string[];
  kind?: "city" | "district";
};

export const emptySlots = (): Slots => ({
  intent: "search",
  date_from: null,
  date_to: null,
  date_label: null,
  date_source: null,
  time_of_day: [],
  municipality_id: null,
  municipality_label: null,
  municipality_source: null,
  near_me: false,
  budget: null,
  budget_per: null,
  free_only: false,
  kids_ages: [],
  with_kids: false,
  adults: null,
  categories: [],
  tags: [],
  pushkin: false,
  accessible: false,
  text: null,
});

const WEEKDAYS: [RegExp, number][] = [
  [/понедельник/, 1],
  [/вторник/, 2],
  [/сред[уа]/, 3],
  [/четверг/, 4],
  [/пятниц[уа]/, 5],
  [/суббот[уа]/, 6],
  [/воскресень[ея]/, 7],
  // башкирский
  [/дүшәмбе/, 1],
  [/шишәмбе/, 2],
  [/шаршамбы/, 3],
  [/кесаҙна/, 4],
  [/йома/, 5],
  [/шәмбе/, 6],
  [/йәкшәмбе/, 7],
];
const MONTHS: [RegExp, number][] = [
  [/январ/, 1],
  [/феврал/, 2],
  [/март/, 3],
  [/апрел/, 4],
  [/ма[йяе](?![\p{L}])/u, 5],
  [/июн/, 6],
  [/июл/, 7],
  [/август/, 8],
  [/сентябр/, 9],
  [/октябр/, 10],
  [/ноябр/, 11],
  [/декабр/, 12],
];
const MONTH_RX =
  "(январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])";

const NUM_WORDS: Record<string, number> = {
  одного: 1,
  один: 1,
  одним: 1,
  двух: 2,
  два: 2,
  двумя: 2,
  трёх: 3,
  трех: 3,
  три: 3,
  четырёх: 4,
  четырех: 4,
  четыре: 4,
  пяти: 5,
  пять: 5,
  шести: 6,
  шесть: 6,
  семи: 7,
  семь: 7,
  восьми: 8,
  восемь: 8,
  девяти: 9,
  девять: 9,
  десяти: 10,
  десять: 10,
  одиннадцати: 11,
  двенадцати: 12,
  тринадцати: 13,
  четырнадцати: 14,
  пятнадцати: 15,
  шестнадцати: 16,
  тысячи: 1000,
  тысяча: 1000,
  тысячу: 1000,
  полторы: 1500,
  пятьсот: 500,
  пятисот: 500,
  триста: 300,
  трёхсот: 300,
  двести: 200,
  двухсот: 200,
  две: 2,
};

const CATEGORY_RULES: [RegExp, CategoryCode][] = [
  [/театр|спектакл|постановк|опер[ауы](?![\p{L}])|балет|мюзикл|драм/u, "theatre"],
  [
    /концерт|музык|оркестр|джаз|(?<![\p{L}])рок(?![\p{L}])|(?<![\p{L}])хор(?![\p{L}])|органн|филармони|курай|вокал|песн/u,
    "music",
  ],
  [/музе|выставк|экспозици|экскурси|галере|картин|күргәҙмә/u, "museum"],
  [/(?<![\p{L}])кино(?![\p{L}])|кинотеатр|фильм|мульт/u, "cinema"],
  [/праздник|фестивал|сабантуй|йыйын|фольклор|народн|ярмарк|гуляни|национальн|байрам/u, "folk"],
  [/лекци|мастер-?класс|встреч|клуб|квиз|викторин|библиотек|беседа|чтени|творческ/, "education"],
  [/детск|для детей|малыш|сказк/, "kids"],
];

const TAG_RULES: [RegExp, TagCode][] = [
  [/пушкинск/, "pushkin"],
  [/премьер/, "premiere"],
  [/на башкирском|башкирском языке|башҡорт телендә/, "on_bashkir"],
  [/под открытым небом|на улице|на свежем воздухе/, "outdoor"],
  [/мастер-?класс/, "master_class"],
  [/экскурси/, "excursion"],
  [/фестивал/, "festival"],
];

const STOP =
  /(?<![\p{L}])(куда|пойти|сходить|сходим|пойдём|пойдем|хочу|хотим|хотелось|бы|можно|что|где|посмотреть|интересн\p{L}*|какие|какое|какой|есть|ли|мне|нам|нас|меня|подскажи\p{L}*|посоветуй\p{L}*|найди|покажи|пожалуйста|в|на|с|со|и|или|до|по|для|за|у|из|от|а|ну|сегодня|завтра|рублей|руб|р|₽|лет|года|год|ребенком|ребёнком|детьми|семьей|семьёй|выходных|выходные|вечером|утром|днём|днем|бесплатно|недорого|рядом|недалеко|поблизости|можем|нибудь|чем|заняться|провести|время|чтобы|было|весело|мероприяти\p{L}*|событи\p{L}*|афиш\p{L}*|спланируй\p{L}*|маршрут\p{L}*|план|день|дня|весь|менән|ҡайҙа|барырға|бараҡ|барайыҡ|көнө|көндө|нимә|бар|кәрәк|булһын|бергә|күрергә|тыңларға|өсөн|ҡалала|районда|ҡарарға|бирегеҙ|күрһәтегеҙ|придумай|придумайте|выдумай|сочини|пожалуйста|только|бесплатн\p{L}*|дешевле|подешевле|ещ[её]|другие|другое|давай|лучше|какой-нибудь|какое-нибудь|какую-нибудь)(?![\p{L}])/gu;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/[!?,;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(token: string): number | null {
  const t = token.replace(/\s/g, "").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^\d+(\.\d+)?к$/.test(t)) return Number(t.slice(0, -1)) * 1000;
  return NUM_WORDS[token] ?? null;
}

function nextWeekday(today: LocalDate, wd: number, next: boolean): LocalDate {
  // «в субботу» — ближайшая (сегодня, если сегодня суббота); «в следующую субботу» — на неделю позже
  const diff = (wd - weekdayOf(today) + 7) % 7;
  return addDays(today, next ? diff + 7 : diff);
}

type DateHit = { from: LocalDate; to: LocalDate; label: string };

export function parseDates(t: string, now: Date): DateHit | null {
  const today = todayLocal(now);
  const year = Number(today.slice(0, 4));
  if (/(?<![\p{L}])(сейчас|прямо сейчас|в ближайший час)(?![\p{L}])/u.test(t))
    return { from: today, to: today, label: "сегодня" };
  if (/послезавтра/.test(t)) {
    const d = addDays(today, 2);
    return { from: d, to: d, label: humanDate(d) };
  }
  if (/(?<![\p{L}])завтра(?![\p{L}])|иртәгә/u.test(t)) {
    const d = addDays(today, 1);
    return { from: d, to: d, label: `завтра, ${humanDate(d, "ru", false)}` };
  }
  if (/(?<![\p{L}])сегодня(?![\p{L}])|бөгөн/u.test(t))
    return { from: today, to: today, label: `сегодня, ${humanDate(today, "ru", false)}` };

  // «с 7 по 9 ноября», «7-9 ноября»
  const range = t.match(new RegExp(`(?:с\\s*)?(\\d{1,2})\\s*(?:-|–|по|до)\\s*(\\d{1,2})\\s*${MONTH_RX}`));
  if (range) {
    const m = MONTHS.find(([rx]) => rx.test(range[3]!))?.[1];
    if (m) {
      const y = monthYear(m, today, year);
      const from = `${y}-${pad(m)}-${pad(Number(range[1]))}`;
      const to = `${y}-${pad(m)}-${pad(Number(range[2]))}`;
      return { from, to, label: `${humanDate(from, "ru", false)} — ${humanDate(to, "ru", false)}` };
    }
  }
  // «7 ноября», «на 15 декабря»
  const single = t.match(new RegExp(`(\\d{1,2})(?:-?го)?\\s*${MONTH_RX}`));
  if (single) {
    const m = MONTHS.find(([rx]) => rx.test(single[2]!))?.[1];
    if (m) {
      const y = monthYear(m, today, year);
      const d = `${y}-${pad(m)}-${pad(Number(single[1]))}`;
      if (isValidDate(d)) return { from: d, to: d, label: humanDate(d) };
      return null;
    }
  }
  // «7.11», «07.11.2026»
  const dotted = t.match(/(?<!\d)(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?!\d)/);
  if (dotted) {
    const m = Number(dotted[2]);
    if (m >= 1 && m <= 12) {
      const y = dotted[3] ? Number(dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3]) : monthYear(m, today, year);
      const d = `${y}-${pad(m)}-${pad(Number(dotted[1]))}`;
      if (isValidDate(d)) return { from: d, to: d, label: humanDate(d) };
    }
  }
  const nextMark = /следующ|через неделю/.test(t);
  if (/выходн|уикенд|викенд|ял көндәр/.test(t)) {
    let [from, to] = weekendRange(now);
    if (nextMark) {
      from = addDays(from, 7);
      to = addDays(to, 7);
    }
    return { from, to, label: `выходные, ${humanDate(from, "ru", false)} — ${humanDate(to, "ru", false)}` };
  }
  for (const [rx, wd] of WEEKDAYS) {
    if (rx.test(t)) {
      const d = nextWeekday(today, wd, nextMark);
      return { from: d, to: d, label: humanDate(d) };
    }
  }
  if (/на (этой )?неделе|эту неделю|в течение недели/.test(t)) {
    const to = addDays(today, 7 - weekdayOf(today));
    return { from: today, to, label: "эта неделя" };
  }
  if (/следующей неделе|следующую неделю/.test(t)) {
    const from = addDays(today, 8 - weekdayOf(today));
    return { from, to: addDays(from, 6), label: "следующая неделя" };
  }
  // «в декабре» — именно месяц в предложном падеже, а не «в Октябрьском» (город)
  const monthHit = t.match(
    /(?<![\p{L}])в (январе|феврале|марте|апреле|мае|июне|июле|августе|сентябре|октябре|ноябре|декабре)(?![\p{L}])/u,
  );
  const month = monthHit ? MONTHS.find(([rx]) => rx.test(monthHit[1]!)) : undefined;
  if (month) {
    const m = month[1];
    const y = monthYear(m, today, year);
    const from = `${y}-${pad(m)}-01` < today ? today : `${y}-${pad(m)}-01`;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      from,
      to: `${y}-${pad(m)}-${pad(last)}`,
      label: `${humanDate(`${y}-${pad(m)}-01`, "ru", false).split(" ")[1]}`,
    };
  }
  if (/новогодн|каникул/.test(t) && /нов/.test(t)) {
    const y = Number(today.slice(5, 7)) >= 6 ? year : year - 1;
    return { from: `${y}-12-30`, to: `${y + 1}-01-08`, label: "новогодние каникулы" };
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
function monthYear(m: number, today: LocalDate, year: number): number {
  return m < Number(today.slice(5, 7)) ? year + 1 : year;
}
function isValidDate(d: string): boolean {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}

/** «31 февраля» и т.п.: дата в тексте есть, но такой не существует. */
export function findInvalidDate(text: string, now: Date): string | null {
  const t = normalizeText(text);
  const m = t.match(new RegExp(`(\\d{1,2})(?:-?го)?\\s*${MONTH_RX}`, "u"));
  if (!m) return null;
  const month = MONTHS.find(([rx]) => rx.test(m[2]!))?.[1];
  if (!month) return null;
  const year = Number(todayLocal(now).slice(0, 4));
  const d = `${year}-${pad(month)}-${pad(Number(m[1]))}`;
  return isValidDate(d) || isValidDate(`${year + 1}-${pad(month)}-${pad(Number(m[1]))}`) ? null : `${m[1]} ${m[2]}`;
}

export function parseBudget(t: string): { budget: number | null; per: Slots["budget_per"]; free: boolean } {
  const free = /бесплатн|без денег|даром|вход свободный|бушлай/.test(t);
  const m = t.match(
    /(?:до|не дороже|дешевле|не больше|в пределах|максимум|бюджет|за)\s+(\d[\d\s]*(?:[.,]\d+)?\s*к?|[а-яё]+)\s*(?:тыс\.?|тысяч[иа]?)?\s*(?:руб\p{L}*|р(?![\p{L}])|₽)?/u,
  );
  let budget: number | null = null;
  if (m?.[1]) {
    const raw = m[1].trim();
    let n = parseNumber(raw.replace(/\s/g, ""));
    if (n === null) n = NUM_WORDS[raw] ?? null;
    if (n !== null && /тыс/.test(m[0]) && n < 100) n *= 1000;
    if (n !== null && n >= 50 && n <= 100000) budget = n;
  }
  if (budget === null) {
    const m2 = t.match(/(\d{3,5})\s*(?:руб\p{L}*|р(?![\p{L}])|₽|на двоих|на троих|на всех|на семью)/u);
    if (m2) budget = Number(m2[1]);
  }
  let per: Slots["budget_per"] = budget === null ? null : "unknown";
  if (budget !== null) {
    if (/на (двоих|троих|всех|семью|четверых)|на всю семью|в сумме|всего/.test(t)) per = "total";
    else if (/за билет|на билет|за человека|с человека|на одного/.test(t)) per = "ticket";
  }
  return { budget, per, free };
}

const KID_WORDS =
  "реб[её]н\\p{L}*|сын\\p{L}*|доч\\p{L}*|дет\\p{L}*|малыш\\p{L}*|внук\\p{L}*|внучк\\p{L}*|школьник\\p{L}*|подрост\\p{L}*|бала\\p{L}*";

const withKidsGuess = (t: string) => new RegExp(`(${KID_WORDS})`, "u").test(t);

export function parseKids(t: string): { withKids: boolean; ages: number[] } {
  const withKids = new RegExp(`(${KID_WORDS})`, "u").test(t) || /всей семь[её]й|семейн/.test(t);
  const ages: number[] = [];
  const re = new RegExp(
    `(?:(${KID_WORDS})[^\\d]{0,12}?(\\d{1,2}|[а-яё]+)\\s*(?:-?ти|-?ми)?\\s*(?:лет|года?|годик\\p{L}*|мес\\p{L}*))|(?:(\\d{1,2}|[а-яё]+)\\s*(?:-?ти|-?ми)?\\s*(?:лет|года?)\\p{L}*\\s*(?:${KID_WORDS}))`,
    "gu",
  );
  for (const m of t.matchAll(re)) {
    const tok = m[2] ?? m[3];
    if (!tok) continue;
    const n = parseNumber(tok) ?? NUM_WORDS[tok.replace(/(ти|ми)$/, "")] ?? null;
    if (n !== null && n >= 0 && n <= 17) ages.push(n);
  }
  // «с детьми 3 и 8 лет», «дочке 4 года»
  if (withKidsGuess(t)) {
    for (const m of t.matchAll(/(\d{1,2}(?:\s*(?:,|и)\s*\d{1,2})*)\s*(?:лет|года?|годик)/gu)) {
      for (const n of m[1]!.split(/\s*(?:,|и)\s*/)) {
        const v = Number(n);
        if (v >= 0 && v <= 17) ages.push(v);
      }
    }
  }
  // «пятилетним», «трёхлетней»
  for (const m of t.matchAll(/(одно|двух|трех|трёх|четырех|четырёх|пяти|шести|семи|восьми|девяти|десяти)летн/g)) {
    const n = NUM_WORDS[m[1]!.replace("одно", "одного")];
    if (n !== undefined) ages.push(n);
  }
  if (ages.length === 0 && /подрост/.test(t)) ages.push(13);
  if (ages.length === 0 && /малыш|грудн|карапуз/.test(t)) ages.push(3);
  return { withKids: withKids || ages.length > 0, ages: [...new Set(ages)] };
}

export function parseTimeOfDay(t: string): Slots["time_of_day"] {
  const out: Slots["time_of_day"] = [];
  if (/утр|с утра|иртә/.test(t)) out.push("morning");
  if (/дн[её]м|днем|в обед|после обеда/.test(t)) out.push("day");
  if (/вечер|после работы|(?<![\p{L}])кис(?![\p{L}])|кисен/u.test(t)) out.push("evening");
  return [...new Set(out)];
}

export function parseMunicipality(t: string, munis: MunicipalityRef[]): MunicipalityRef | null {
  const words = t.split(/\s+/);
  let best: { m: MunicipalityRef; len: number } | null = null;
  for (const m of munis) {
    for (const stem of m.stems) {
      if (stem.length < 2) continue;
      const maxSuffix = stem.length <= 3 ? 2 : 4;
      // Район — только прилагательное («в Стерлитамакском районе»); город — без суффикса -ск- («в Стерлитамаке»)
      const hit = words.some((w, i) => {
        if (!w.startsWith(stem)) return false;
        const rest = w.slice(stem.length);
        const adjectival = /^(ск|цк)/.test(rest) || /^район/.test(words[i + 1] ?? "");
        if (m.kind === "district") return adjectival && rest.length <= 6;
        if (m.kind === "city" && /^(ск|цк)/.test(rest) && !stem.endsWith("ск")) return false;
        return rest.length <= maxSuffix;
      });
      if (hit && (!best || stem.length > best.len)) best = { m, len: stem.length };
    }
  }
  return best?.m ?? null;
}

export function parseRules(text: string, now: Date, munis: MunicipalityRef[]): Slots {
  const t = normalizeText(text);
  const s = emptySlots();
  if (/^(\/start|привет|здравствуй|добрый|салям|сәләм|хай|hello)/.test(t) && t.split(" ").length <= 3) {
    s.intent = "help";
    return s;
  }
  if (
    /погод|курс (валют|доллар|евро)|новост|политик|рецепт|анекдот|домашн\p{L}* задани|напиши (код|стих|сочинени)|кто (ты|такой)|сколько будет/u.test(
      t,
    )
  ) {
    s.intent = "offtopic";
    return s;
  }
  if (/спланиру|маршрут|план на день|программу на день|день в уфе|на весь день/.test(t)) s.intent = "plan_day";
  const d = parseDates(t, now);
  if (d) {
    s.date_from = d.from;
    s.date_to = d.to;
    s.date_label = d.label;
    s.date_source = "user";
  }
  s.time_of_day = parseTimeOfDay(t);
  const b = parseBudget(t);
  s.budget = b.budget;
  s.budget_per = b.per;
  s.free_only = b.free;
  const k = parseKids(t);
  s.with_kids = k.withKids;
  s.kids_ages = k.ages;
  const mu = parseMunicipality(t, munis);
  if (mu) {
    s.municipality_id = mu.id;
    s.municipality_label = mu.name;
    s.municipality_source = "user";
  }
  s.near_me = /рядом|поблизости|недалеко|возле меня|около меня|в моем районе|по близости/.test(t);
  for (const [rx, c] of CATEGORY_RULES) if (rx.test(t) && !s.categories.includes(c)) s.categories.push(c);
  if (s.with_kids && s.categories.length === 0) s.categories = [];
  for (const [rx, tag] of TAG_RULES) if (rx.test(t) && !s.tags.includes(tag)) s.tags.push(tag);
  s.pushkin = s.tags.includes("pushkin");
  s.accessible = /доступн\p{L}* сред|коляск|инвалид|незрячи|слабовидящ|глухи|слабослышащ|жестов/u.test(t);

  // Конкретные жанры остаются и в полнотекстовом поиске: «балет» — это не «любой театр»
  const genres = [
    ...t.matchAll(
      /(?<![\p{L}])(балет\p{L}*|опер[аыеу]?|оперетт\p{L}*|мюзикл\p{L}*|джаз\p{L}*|органн\p{L}*|хор(?:ов\p{L}*)?|кукольн\p{L}*|фольклор\p{L}*|стендап\p{L}*|рок)(?![\p{L}])/gu,
    ),
  ].map((m) => m[1]!);
  // Остаток — для полнотекстового поиска (названия, имена, жанры)
  let rest = t;
  for (const [rx] of CATEGORY_RULES) rest = rest.replace(new RegExp(`\\S*(${rx.source})\\S*`, "gu"), " ");
  rest = rest
    .replace(new RegExp(`\\S*${MONTH_RX}\\S*`, "gu"), " ")
    .replace(/\d+/g, " ")
    .replace(STOP, " ")
    .replace(new RegExp(`\\S*(${KID_WORDS})\\S*`, "gu"), " ");
  for (const [rx] of WEEKDAYS) rest = rest.replace(new RegExp(`\\S*${rx.source}\\S*`, "gu"), " ");
  if (mu) for (const stem of mu.stems) rest = rest.replace(new RegExp(`\\S*${stem}\\S*`, "gu"), " ");
  for (const [rx] of TAG_RULES) rest = rest.replace(new RegExp(`\\S*(${rx.source})\\S*`, "gu"), " ");
  rest = rest
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 4 &&
        !/^(тыс|пушкин|детям|своим|своей|моим|моей|какой|нибудь|часов|утра|дня|вечера|двоих|всех|семью)/.test(w),
    )
    .join(" ")
    .trim();
  rest = [...genres, rest].join(" ").trim();
  s.text = rest.length >= 3 ? rest : null;

  const recognized =
    s.date_from ||
    s.budget !== null ||
    s.free_only ||
    s.with_kids ||
    s.municipality_id ||
    s.categories.length ||
    s.tags.length ||
    s.near_me ||
    s.time_of_day.length;
  if (!recognized && !s.text && s.intent === "search")
    s.intent = /куда|сходить|пойти|афиш|событ|мероприят/.test(t) ? "search" : "smalltalk";
  return s;
}

export function localNowLabel(now: Date): string {
  return humanDate(localParts(now).date);
}
