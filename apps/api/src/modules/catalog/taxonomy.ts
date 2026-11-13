/** Таксономия: 7 категорий («зонтик курая») и сквозные теги (docs/03-functional-spec.md §1.1). */
import type { CategoryCode, TagCode } from "@afisha/contract";

export const CATEGORIES: { code: CategoryCode; ru: string; ba: string; color: string }[] = [
  { code: "theatre", ru: "Театр", ba: "Театр", color: "#B8322A" },
  { code: "music", ru: "Музыка", ba: "Музыка", color: "#2E64A8" },
  { code: "museum", ru: "Музеи и выставки", ba: "Музейҙар һәм күргәҙмәләр", color: "#8F6209" },
  { code: "kids", ru: "Детям", ba: "Балаларға", color: "#A84A14" },
  { code: "folk", ru: "Народная культура и праздники", ba: "Халыҡ мәҙәниәте һәм байрамдар", color: "#2F7A4B" },
  { code: "cinema", ru: "Кино", ba: "Кино", color: "#6B3A6E" },
  { code: "education", ru: "Лекции и встречи", ba: "Лекциялар һәм осрашыуҙар", color: "#1F6B70" },
];

export const TAGS: Record<TagCode, { ru: string; ba: string }> = {
  free: { ru: "Бесплатно", ba: "Бушлай" },
  pushkin: { ru: "Пушкинская карта", ba: "Пушкин картаһы" },
  premiere: { ru: "Премьера", ba: "Премьера" },
  family: { ru: "Для всей семьи", ba: "Бөтә ғаилә өсөн" },
  youth: { ru: "Для молодёжи", ba: "Йәштәр өсөн" },
  accessible: { ru: "Доступная среда", ba: "Үтемле мөхит" },
  on_bashkir: { ru: "На башкирском языке", ba: "Башҡорт телендә" },
  outdoor: { ru: "Под открытым небом", ba: "Асыҡ һауала" },
  master_class: { ru: "Мастер-класс", ba: "Оҫталыҡ дәресе" },
  excursion: { ru: "Экскурсия", ba: "Экскурсия" },
  festival: { ru: "Фестиваль", ba: "Фестиваль" },
};

export const GENRE_TO_CATEGORY: Record<string, CategoryCode> = {
  Спектакли: "theatre",
  Концерты: "music",
  Выставки: "museum",
  Экскурсии: "museum",
  Музеи: "museum",
  Кино: "cinema",
  Кинопоказы: "cinema",
  Обучение: "education",
  Встречи: "education",
  Лекции: "education",
  "Мастер-классы": "education",
  Праздники: "folk",
  Фестивали: "folk",
  "Народные праздники": "folk",
};

const KEYWORD_RULES: [RegExp, CategoryCode][] = [
  [/спектакл|постановк|театр|опер[аы](?![\p{L}])|балет|мюзикл/iu, "theatre"],
  [/концерт|оркестр|(?<![\p{L}])хор(?![\p{L}])|джаз|(?<![\p{L}])рок(?![\p{L}])|вокал|музыкал/iu, "music"],
  [/выставк|экспозици|музе|экскурси|галере/i, "museum"],
  [/кино|фильм|кинопоказ|мультфильм/i, "cinema"],
  [/сабантуй|йыйын|праздник|фестивал|фольклор|народн|ярмарк|гуляни/i, "folk"],
  [/лекци|мастер-?класс|встреч|клуб|беседа|квиз|викторин|чтени|библиотек/i, "education"],
];
const KIDS_RE = /детск|для детей|сказк|малыш|школьник|семейн|кукол|кукольн|мульт/i;
const BASHKIR_LANG_RE = /на башкирском|башкирском языке|башҡорт телендә/i;
const OUTDOOR_RE = /под открытым небом|на открытой площадке|в парке|на площади/i;

export function classify(
  genres: string[],
  sourceTags: string[],
  title: string,
  text: string,
  age: number | null,
): { categories: CategoryCode[]; tags: TagCode[] } {
  const cats: CategoryCode[] = [];
  for (const g of genres) {
    const c = GENRE_TO_CATEGORY[g];
    if (c && !cats.includes(c)) cats.push(c);
  }
  const hay = `${title} ${text.slice(0, 600)}`;
  if (cats.length === 0) {
    const hit = KEYWORD_RULES.find(([rx]) => rx.test(hay));
    cats.push(hit ? hit[1] : "education");
  }
  const st = new Set(sourceTags.map((t) => t.toLowerCase()));
  const kids = st.has("для детей") || KIDS_RE.test(title) || (age === 0 && KIDS_RE.test(hay));
  if (kids && !cats.includes("kids")) cats.push("kids");
  const tags: TagCode[] = [];
  if (st.has("премьера")) tags.push("premiere");
  if (st.has("доступная среда")) tags.push("accessible");
  if (st.has("для молодежи") || st.has("молодые люди")) tags.push("youth");
  if (st.has("семья") || st.has("для всей семьи") || /семейн/i.test(hay)) tags.push("family");
  if (BASHKIR_LANG_RE.test(hay)) tags.push("on_bashkir");
  if (OUTDOOR_RE.test(hay)) tags.push("outdoor");
  if (/мастер-?класс/i.test(hay)) tags.push("master_class");
  if (genres.includes("Экскурсии")) tags.push("excursion");
  if (/фестивал/i.test(hay)) tags.push("festival");
  return { categories: cats, tags };
}
