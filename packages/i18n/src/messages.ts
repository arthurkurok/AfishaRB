/** Словари целиком — только для сервера (RSC, route handlers) и тестов. */
import ba from "../ba.json" with { type: "json" };
import ru from "../ru.json" with { type: "json" };
import { type Messages, type Translate, translator } from "./index";
import type { Lang } from "./types";

const dictionaries: Record<Lang, Messages> = { ru, ba: ba as Messages };

export function getMessages(lang: Lang): Messages {
  return dictionaries[lang];
}

export function createT(lang: Lang): Translate {
  return translator(lang, dictionaries[lang], lang === "ru" ? undefined : ru);
}

export { ba, ru };
