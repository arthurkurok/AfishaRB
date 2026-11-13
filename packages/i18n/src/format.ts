/**
 * Мини-реализация ICU MessageFormat: подстановки `{name}` и множественное число
 * `{count, plural, one {# событие} few {# события} many {# событий} other {# события}}`.
 * Полный ICU не нужен: в словарях используются только эти две конструкции.
 */
import type { Lang } from "./types";

export type Vars = Record<string, string | number | null | undefined>;

const pluralRules = new Map<Lang, Intl.PluralRules | null>();

/** Категория множественного числа. Для башкирского существительное после числа не меняется — всегда `other`. */
export function pluralCategory(lang: Lang, n: number): Intl.LDMLPluralRule {
  if (lang === "ba") return "other";
  let rules = pluralRules.get(lang);
  if (rules === undefined) {
    try {
      rules = new Intl.PluralRules(lang);
    } catch {
      rules = null;
    }
    pluralRules.set(lang, rules);
  }
  return rules ? rules.select(n) : "other";
}

/** Находит парную закрывающую скобку, учитывая вложенность. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function formatPlural(body: string, n: number, lang: Lang, vars: Vars): string {
  const options = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf("{", i);
    if (open === -1) break;
    const key = body.slice(i, open).trim();
    const close = matchBrace(body, open);
    if (close === -1) break;
    options.set(key, body.slice(open + 1, close));
    i = close + 1;
  }
  const exact = options.get(`=${n}`);
  const chosen = exact ?? options.get(pluralCategory(lang, n)) ?? options.get("other") ?? "";
  const num = new Intl.NumberFormat(lang === "ba" ? "ru" : lang).format(n);
  return formatMessage(chosen, vars, lang).replaceAll("#", num);
}

export function formatMessage(message: string, vars: Vars = {}, lang: Lang = "ru"): string {
  let out = "";
  let i = 0;
  while (i < message.length) {
    const open = message.indexOf("{", i);
    if (open === -1) {
      out += message.slice(i);
      break;
    }
    out += message.slice(i, open);
    const close = matchBrace(message, open);
    if (close === -1) {
      out += message.slice(open);
      break;
    }
    const inner = message.slice(open + 1, close);
    const pluralMatch = /^\s*(\w+)\s*,\s*plural\s*,([\s\S]*)$/.exec(inner);
    if (pluralMatch) {
      const n = Number(vars[pluralMatch[1] ?? ""] ?? 0);
      out += formatPlural(pluralMatch[2] ?? "", n, lang, vars);
    } else {
      const value = vars[inner.trim()];
      out += value === undefined || value === null ? "" : String(value);
    }
    i = close + 1;
  }
  return out;
}

/** Плейсхолдеры сообщения (для проверки паритета ru/ba в тестах). */
export function placeholders(message: string): string[] {
  const names = new Set<string>();
  for (const m of message.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)) if (m[1]) names.add(m[1]);
  return [...names].sort();
}
