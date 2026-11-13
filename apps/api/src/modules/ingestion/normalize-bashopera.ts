/**
 * Парсер HTML-афиши Башкирского государственного театра оперы и балета (bashopera.ru/affiche/,
 * «Ближайшие спектакли»). Второй внешний источник сбора (ТЗ уровень 4, docs/06-data.md §2).
 * Чистая функция — покрыта тестами на фикстуре test/fixtures/bashopera-affiche.html.
 * Год на странице не указан: он восстанавливается от даты снимка с переходом через Новый год.
 */
import type { CategoryCode, TagCode } from "@afisha/contract";
import { classify } from "../catalog/index.js";
import { decodeEntities, makeSummary, normalizeAge } from "./normalize-culture-ru.js";
import type { NOrganization, NormalizedEvent, NSession, NVenue } from "./types.js";

export const BASHOPERA_SOURCE_ID = "bashopera";
export const BASHOPERA_BASE = "https://bashopera.ru";

/**
 * Театр — единственная площадка источника. Данные со страницы контактов bashopera.ru/about/contacts/;
 * координат на афише нет — не выдумываем (lat/lon = null).
 */
const THEATER = {
  name: "Башкирский государственный академический театр оперы и балета",
  address: "г. Уфа, ул. Ленина, 5/1",
  municipalityId: "ufa",
  municipalityTitle: "Уфа",
  orgExternalId: "basho:theatre",
};

/** Разделы афиши (класс fs-N у элемента расписания) → жанр источника и категории каталога. */
export const SECTIONS: Record<string, { title: string; categories: CategoryCode[] }> = {
  "2": { title: "Опера", categories: ["theatre"] },
  "3": { title: "Оперетта", categories: ["theatre"] },
  "4": { title: "Музыкальная комедия", categories: ["theatre"] },
  "5": { title: "Спектакль для детей", categories: ["theatre", "kids"] },
  "6": { title: "Концерт", categories: ["music"] },
  "7": { title: "Балет", categories: ["theatre"] },
};

/** Основы месяцев с падежами: «13 ноября», «декабре». */
const MONTH_STEMS = [
  "январ",
  "феврал",
  "март",
  "апрел",
  "ма",
  "июн",
  "июл",
  "август",
  "сентябр",
  "октябр",
  "ноябр",
  "декабр",
];

const monthOf = (text: string): number | null => {
  const t = text.toLowerCase();
  // дата бывает «13 ноября», заголовок — «Ноябрь»: ищем основу внутри текста;
  // при равной позиции предпочитаем более длинную («март» точнее «ма»)
  let best: number | null = null;
  let bestIdx = -1;
  MONTH_STEMS.forEach((stem, i) => {
    const idx = t.indexOf(stem);
    if (idx === -1) return;
    if (best === null || idx < bestIdx || (idx === bestIdx && stem.length > MONTH_STEMS[best]!.length)) {
      best = i;
      bestIdx = idx;
    }
  });
  return best === null ? null : best + 1;
};

/** Часовой пояс региона: местное время афиши (UTC+5) → timestamptz. */
const localToUtc = (year: number, month: number, day: number, hh: number, mm: number) =>
  new Date(Date.UTC(year, month - 1, day, hh - 5, mm));

const collapse = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

/** Цена из текста афиши: «от 300 до 1 500 ₽», «от 500 ₽», «Бесплатно». */
export function parsePriceText(text: string): { min: number | null; max: number | null; free: boolean } {
  const t = collapse(text);
  if (!t) return { min: null, max: null, free: false };
  if (/бесплатн/i.test(t)) return { min: null, max: null, free: true };
  // числа с пробелом-разделителем тысяч: «1 500»; остальные цифры не трогаем
  const nums = [...t.matchAll(/\d+(?:[ \u00a0]\d{3})*/g)]
    .map((m) => Number(m[0].replace(/[ \u00a0]/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length === 0) return { min: null, max: null, free: false };
  return { min: nums[0]!, max: nums.length > 1 ? nums[nums.length - 1]! : null, free: false };
}

/** Один показ афиши (сырые поля, как на странице). */
type Item = {
  productionId: string;
  productionPath: string;
  performanceId: string;
  title: string;
  sectionId: string | null;
  composer: string | null;
  premiere: boolean;
  pushkin: boolean;
  age: number | null;
  extra: string | null;
  hallId: string;
  hallName: string;
  year: number;
  month: number;
  day: number;
  time: string;
  buyPath: string | null;
  priceText: string;
};

const absolute = (path: string | null): string | null => (path ? `${BASHOPERA_BASE}${path}` : null);

/**
 * Разбор страницы: события группируются по постановке (ссылка /repertoire/<тип>/<id>/),
 * каждый элемент афиши — отдельный сеанс. Битый HTML не бросает исключение — пустой результат.
 */
export function parseAffiche(html: string, now: Date): { event: NormalizedEvent; raw: Record<string, unknown> }[] {
  // Блоки афиши: <div class="item title">Месяц</div> и <div class="item content ..." id="...">
  const blockRe = /<div class="item (title|content)([^"]*)"(?: id="([^"]+)")?>/g;
  const blocks: { kind: "title" | "content"; classes: string; id: string | null; start: number }[] = [];
  for (const m of html.matchAll(blockRe))
    blocks.push({ kind: m[1] as "title" | "content", classes: m[2] ?? "", id: m[3] ?? null, start: m.index ?? 0 });

  const items: Item[] = [];
  // Год: афиша «ближайших» событий. Первый месяц сильно меньше текущего — уже перешли Новый год;
  // дальше год увеличивается при каждом уменьшении месяца (ноябрь → декабрь → январь).
  let year: number | null = null;
  let prevMonth: number | null = null;
  const advance = (month: number): number => {
    if (year === null) {
      year = now.getUTCFullYear() + (month < now.getUTCMonth() + 1 - 6 ? 1 : 0);
      prevMonth = month;
      return year;
    }
    if (month < prevMonth!) {
      year += 1;
      prevMonth = month;
    }
    return year;
  };

  for (let i = 0; i < blocks.length; i++) {
    const seg = html.slice(blocks[i]!.start, blocks[i + 1]?.start ?? html.length);
    if (blocks[i]!.kind === "title") {
      const m = seg.match(/>([^<]*)</); // текст заголовка месяца
      const month = m?.[1] ? monthOf(collapse(m[1])) : null;
      if (month !== null) advance(month);
      continue;
    }
    const dateMatch = seg.match(/<div class="date"><strong>([^<]+)<\/strong>/);
    const nameMatch = seg.match(/<div class="name"><a href="([^"]+)">([^<]*)<\/a>/);
    const hallMatch = seg.match(
      /<div class="hall"><strong><a[^>]*href="\/tickets\/halls\/(\d+)\/[^"]*"[^>]*>([^<]+)<\/a>,\s*(\d{1,2}:\d{2})/,
    );
    if (!dateMatch?.[1] || !nameMatch?.[1] || !hallMatch?.[1]) continue; // битый элемент — пропускаем
    const month = monthOf(collapse(dateMatch[1]));
    const day = Number(dateMatch[1].trim().match(/^(\d{1,2})/)?.[1]);
    const [hh, mm] = hallMatch[3]!.split(":").map(Number) as [number, number];
    if (month === null || !day || !Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const itemYear = advance(month);

    const productionPath = nameMatch[1]!;
    const productionId = productionPath.match(/\/repertoire\/[\w-]+\/(\d+)\/?$/)?.[1] ?? productionPath;
    // идентификатор показа: последний сегмент ссылки «Билеты», иначе — id блока
    const buyMatch = seg.match(/<a href="(\/repertoire\/[^"]+)"[^>]*class="b-byu-btn"/);
    const performanceId =
      buyMatch?.[1]?.match(/\/(\d+)\/?$/)?.[1] ?? blocks[i]!.id?.split("_").pop() ?? `${productionId}-${items.length}`;
    const sectionId = [...blocks[i]!.classes.matchAll(/fs-(\d+)/g)].map((m) => m[1]!).find((s) => s !== "0") ?? null;
    const ageMatch = seg.match(/<li>(\d+)\+<\/li>/);
    const composer = seg.match(/<li class="composer">([^<]+)<\/li>/)?.[1] ?? null;
    const extra = seg.match(/<div class="extra">([^<]*)<\/div>/)?.[1] ?? null;
    const priceText = seg.match(/<div class="price">([\s\S]*?)<\/div>/)?.[1] ?? "";

    items.push({
      productionId,
      productionPath,
      performanceId,
      title: collapse(nameMatch[2] ?? ""),
      sectionId,
      composer: composer ? collapse(composer) : null,
      premiere: /<li class="premiere">/.test(seg),
      pushkin: /class="pushkin"/.test(seg),
      age: ageMatch ? normalizeAge(ageMatch[1]) : null,
      extra: extra ? collapse(extra) : null,
      hallId: hallMatch[1]!,
      hallName: collapse(hallMatch[2] ?? ""),
      year: itemYear,
      month,
      day,
      time: hallMatch[3]!,
      buyPath: buyMatch?.[1] ?? null,
      priceText,
    });
  }

  // Группировка по постановке
  const byProduction = new Map<string, Item[]>();
  for (const it of items) {
    const list = byProduction.get(it.productionId) ?? [];
    list.push(it);
    byProduction.set(it.productionId, list);
  }

  const out: { event: NormalizedEvent; raw: Record<string, unknown> }[] = [];
  for (const group of byProduction.values()) {
    const first = group[0]!;
    const section = first.sectionId ? SECTIONS[first.sectionId] : undefined;
    // Категории: раздел афиши точнее ключевых слов; для неизвестного раздела — общая классификация
    const categories: CategoryCode[] = section
      ? section.categories
      : classify([], [], first.title, "", first.age).categories;
    const tags: TagCode[] = [];
    const premiere = group.some((g) => g.premiere);
    const pushkin = group.some((g) => g.pushkin);
    if (premiere) tags.push("premiere");
    if (pushkin) tags.push("pushkin");

    // Цена: агрегат по всем показам постановки (мин/макс); бесплатная — только если бесплатны все
    const prices = group.map((g) => parsePriceText(g.priceText)).filter((p) => p.free || p.min !== null);
    const isFree = prices.length > 0 && prices.every((p) => p.free);
    if (isFree) tags.push("free");
    const mins = prices.map((p) => p.min).filter((v): v is number => v !== null);
    const maxs = prices.map((p) => p.max).filter((v): v is number => v !== null);
    const priceMin = !isFree && mins.length ? Math.min(...mins).toFixed(2) : null;
    const priceMax = !isFree && maxs.length ? Math.max(...maxs).toFixed(2) : null;

    // Залы постановки — площадки; ключ с префиксом, чтобы не пересечься с id Культура.РФ
    const halls = new Map(group.map((g) => [g.hallId, g.hallName]));
    const venues: NVenue[] = [...halls].map(([hallId, hallName]) => ({
      externalId: `basho:${hallId}`,
      name: `${THEATER.name}, ${hallName}`,
      address: THEATER.address,
      lat: null,
      lon: null,
      municipalityId: THEATER.municipalityId,
      municipalityTitle: THEATER.municipalityTitle,
      cultureLocaleId: null,
      externalIds: { bashopera_hall_id: hallId },
    }));
    const organization: NOrganization = {
      externalId: THEATER.orgExternalId,
      name: THEATER.name,
      shortName: null,
      externalIds: { bashopera_org_id: "theatre" },
    };
    const sessions: NSession[] = group.map((g) => {
      const [hh, mm] = g.time.split(":").map(Number) as [number, number];
      return {
        externalId: g.performanceId,
        venueExternalId: `basho:${g.hallId}`,
        startsAt: localToUtc(g.year, g.month, g.day, hh, mm),
        endsAt: null,
        isRange: false,
        ticketUrl: absolute(g.buyPath),
      };
    });

    // Краткая аннотация из жанра, композитора и пометок (составы показов различаются — в карточку не берём)
    const musicLine =
      first.composer && !/концерт|праздничн|программ|солист|исполнен/i.test(first.composer)
        ? `Музыка ${first.composer}`
        : null;
    const summaryParts = [section?.title ?? null, musicLine, premiere ? "Премьера" : null, first.extra];
    const age = group.find((g) => g.age !== null)?.age ?? null;

    const event: NormalizedEvent = {
      sourceId: BASHOPERA_SOURCE_ID,
      externalId: first.productionId,
      title: first.title,
      summary: makeSummary(summaryParts.filter(Boolean).join(". ")),
      descriptionHtml: "",
      categories: [...new Set(categories)].sort(),
      tags: [...new Set(tags)].sort(),
      sourceGenres: [section?.title, first.composer].filter(Boolean) as string[],
      ageRating: age,
      priceMin,
      priceMax,
      isFree,
      pushkinCard: pushkin,
      accessible: false,
      isPermanent: false,
      ticketUrl: absolute(group.find((g) => g.buyPath)?.buyPath ?? null),
      images: [],
      organization,
      venues,
      sessions,
      sourceUrl: absolute(first.productionPath),
      sourceUpdatedAt: null,
      languages: ["ru"],
    };
    const raw = {
      production: {
        id: first.productionId,
        path: first.productionPath,
        title: first.title,
        section: section?.title ?? first.sectionId,
        composer: first.composer,
        premiere,
        pushkin,
        age,
        extra: first.extra,
      },
      performances: group.map((g) => ({
        id: g.performanceId,
        date: `${String(g.day).padStart(2, "0")}.${String(g.month).padStart(2, "0")}.${g.year}`,
        time: g.time,
        hall_id: g.hallId,
        hall: g.hallName,
        buy: g.buyPath,
        price: collapse(g.priceText) || null,
      })),
    };
    out.push({ event, raw });
  }
  return out;
}
