"use client";
/**
 * Локализация в клиентских компонентах. Словарь текущего языка приходит с сервера один раз (корневой layout),
 * поэтому в клиентский бандл не попадают оба словаря целиком.
 */
import { type Lang, type Messages, type Translate, translator } from "@afisha/i18n";
import { createContext, type ReactNode, useContext, useMemo } from "react";

interface I18nValue {
  lang: Lang;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ lang, messages, children }: { lang: Lang; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: translator(lang, messages) }), [lang, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n вне I18nProvider");
  return ctx;
}
