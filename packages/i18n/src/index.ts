/**
 * Ядро локализации без словарей: типы, форматирование сообщений, даты.
 * Словари подключаются отдельно (`@afisha/i18n/messages`), чтобы клиентский код и виджет
 * не тянули оба языка целиком: на сайте словарь текущего языка передаётся с сервера.
 */
import type ru from "../ru.json";
import { formatMessage, type Vars } from "./format";
import type { Lang, Leaves } from "./types";

export * from "./dates";
export { formatMessage, placeholders, pluralCategory, type Vars } from "./format";
export * from "./types";

/** Форма словаря задаётся русским словарём; ba обязан иметь те же ключи (проверяется тестом). */
export type Messages = typeof ru;
export type MessageKey = Leaves<Messages>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

export function lookup(messages: unknown, key: string): string | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/** Переводчик по готовому словарю. Отсутствующий ключ возвращается как есть — его видно в интерфейсе и тестах. */
export function translator(lang: Lang, messages: Messages, fallback?: Messages): Translate {
  return (key, vars) => {
    const message = lookup(messages, key) ?? (fallback ? lookup(fallback, key) : undefined) ?? key;
    return formatMessage(message, vars, lang);
  };
}
