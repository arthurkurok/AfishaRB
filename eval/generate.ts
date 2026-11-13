/**
 * Генератор эталонного набора slots_ru: шаблоны × значения с известным правильным ответом.
 * «Сейчас» фиксировано: понедельник 2 ноября 2026, 10:00 по Уфе. Плюс ручные трудные случаи в hard_ru.jsonl.
 */
import { writeFileSync } from "node:fs";

type Case = { id: string; text: string; expect: Record<string, unknown> };
const cases: Case[] = [];
const dates: [string, string, string][] = [
  ["в субботу", "2026-11-07", "2026-11-07"],
  ["в воскресенье", "2026-11-08", "2026-11-08"],
  ["на выходных", "2026-11-07", "2026-11-08"],
  ["завтра", "2026-11-03", "2026-11-03"],
  ["сегодня", "2026-11-02", "2026-11-02"],
  ["послезавтра", "2026-11-04", "2026-11-04"],
  ["в пятницу", "2026-11-06", "2026-11-06"],
  ["7 ноября", "2026-11-07", "2026-11-07"],
  ["на следующих выходных", "2026-11-14", "2026-11-15"],
  ["в следующую субботу", "2026-11-14", "2026-11-14"],
  ["с 10 по 12 ноября", "2026-11-10", "2026-11-12"],
  ["в декабре", "2026-12-01", "2026-12-31"],
];
const cities: [string, string][] = [
  ["в Уфе", "ufa"],
  ["в Стерлитамаке", "sterlitamak"],
  ["в Салавате", "salavat"],
  ["в Нефтекамске", "neftekamsk"],
  ["в Октябрьском", "oktyabrskii"],
  ["в Сибае", "sibay"],
  ["в Туймазах", "tuymazy"],
  ["в Белорецком районе", "beloreckiy-rayon"],
  ["в Баймакском районе", "baymakskiy-rayon"],
  ["", ""],
];
const budgets: [string, number | null, boolean][] = [
  ["до 1000 рублей", 1000, false],
  ["до 500 р", 500, false],
  ["не дороже 2000 рублей", 2000, false],
  ["бесплатно", null, true],
  ["", null, false],
];
const who: [string, boolean, number[]][] = [
  ["с ребёнком 5 лет", true, [5]],
  ["с сыном 8 лет", true, [8]],
  ["с детьми 3 и 10 лет", true, [3, 10]],
  ["с ребёнком", true, []],
  ["", false, []],
];
const cats: [string, string[]][] = [
  ["спектакль", ["theatre"]],
  ["концерт", ["music"]],
  ["выставку", ["museum"]],
  ["кино", ["cinema"]],
  ["мастер-класс", ["education"]],
  ["", []],
];
const lead = ["Куда пойти", "Что посмотреть", "Хочу на", "Посоветуй", "Куда сходить"];
let n = 0;
for (const [dt, from, to] of dates)
  for (const [ct, muni] of cities)
    for (const [bt, budget, free] of budgets)
      for (const [wt, kids, ages] of who)
        for (const [cat, categories] of cats) {
          n++;
          if (n % 23 !== 0) continue; // выборка ~450 из полного перебора
          const text = [lead[n % lead.length], cat, dt, ct, wt, bt].filter(Boolean).join(" ").replace(/\s+/g, " ");
          cases.push({
            id: `gen-${n}`,
            text,
            expect: {
              date_from: from,
              date_to: to,
              municipality_id: muni || null,
              budget,
              free_only: free,
              with_kids: kids,
              kids_ages: ages,
              categories,
            },
          });
        }
writeFileSync(
  new URL("./datasets/slots_ru.jsonl", import.meta.url),
  `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`,
);
console.log(`slots_ru.jsonl: ${cases.length} запросов`);
