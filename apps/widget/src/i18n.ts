/** Строки виджета из packages/i18n (пространство имён widget) — в бандл попадают только они. */

import { formatMessage, type Vars } from "@afisha/i18n";
import { widget as ba } from "@afisha/i18n/ba.json";
import { widget as ru } from "@afisha/i18n/ru.json";
import type { WidgetLang } from "./options";

export type WidgetKey = keyof typeof ru;

const dict: Record<WidgetLang, Record<WidgetKey, string>> = { ru, ba };

export function wt(lang: WidgetLang, key: WidgetKey, vars?: Vars): string {
  return formatMessage(dict[lang][key] ?? dict.ru[key], vars, lang);
}
