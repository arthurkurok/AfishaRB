/** Локализация на сервере: словарь и переводчик по языку из сегмента [lang]. */
import { isLang, type Lang } from "@afisha/i18n";
import { createT, getMessages } from "@afisha/i18n/messages";
import { notFound } from "next/navigation";

export { createT, getMessages };

/** Язык из параметров маршрута; неизвестный язык — 404. */
export async function resolveLang(params: Promise<{ lang: string }>): Promise<Lang> {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return lang;
}
