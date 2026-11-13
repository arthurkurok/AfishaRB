import { describe, expect, it } from "vitest";
import { placeholders } from "../src/index";
import { ba, createT, ru } from "../src/messages";

type Tree = { [k: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}

const ruLeaves = leaves(ru as Tree);
const baLeaves = leaves(ba as Tree);

describe("словари ru/ba", () => {
  it("в ba есть все ключи ru (нет needs_translation)", () => {
    const missing = [...ruLeaves.keys()].filter((k) => !baLeaves.has(k));
    expect(missing).toEqual([]);
  });

  it("в ba нет лишних ключей", () => {
    const extra = [...baLeaves.keys()].filter((k) => !ruLeaves.has(k));
    expect(extra).toEqual([]);
  });

  it("плейсхолдеры совпадают", () => {
    const diff = [...ruLeaves].filter(
      ([k, v]) => placeholders(v).join() !== placeholders(baLeaves.get(k) ?? "").join(),
    );
    expect(diff.map(([k]) => k)).toEqual([]);
  });

  it("нет пустых строк", () => {
    const empty = [...ruLeaves, ...baLeaves].filter(([, v]) => !v.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("башкирский словарь действительно башкирский: есть буквы ә ғ ҙ ҡ ң ө ҫ ү һ", () => {
    const all = [...baLeaves.values()].join(" ");
    for (const ch of "әғҙҡңөҫүһ") expect(all.includes(ch), ch).toBe(true);
  });

  it("брендовые и юридические термины не потеряны", () => {
    expect(ba.about.recommendIntro).toContain("10.2-2");
    expect(ba.about.recommendIntro).toContain("149-ФЗ");
    expect(ba.about.translationAction.length).toBeGreaterThan(5);
  });
});

describe("createT", () => {
  it("подставляет переменные и плюрализует по-русски", () => {
    const t = createT("ru");
    expect(t("common.events", { count: 1 })).toBe("1 событие");
    expect(t("common.events", { count: 3 })).toBe("3 события");
    expect(t("common.events", { count: 11 })).toBe("11 событий");
    expect(t("common.events", { count: 5919 })).toBe("5\u00a0919 событий");
    expect(t("common.priceFrom", { price: 400 })).toBe("от 400 ₽");
  });

  it("по-башкирски существительное после числа не меняется", () => {
    const t = createT("ba");
    expect(t("common.events", { count: 1 })).toBe("1 сара");
    expect(t("common.events", { count: 16 })).toBe("16 сара");
    expect(t("search.found", { count: 3 })).toBe("3 сара табылды");
  });

  it("неизвестный ключ возвращается как есть", () => {
    const t = createT("ru");
    // @ts-expect-error — намеренно неверный ключ
    expect(t("nope.missing")).toBe("nope.missing");
  });
});
