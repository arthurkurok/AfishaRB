"use client";
/**
 * Интеграция с Telegram Mini App (03-functional-spec §3.8, 07-design §13):
 * тема из themeParams (акцент и ромбы остаются фирменными), BackButton, MainButton, haptic feedback,
 * безопасные зоны. Вне Telegram (обычный браузер) всё работает как компактная веб-версия.
 */
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

interface TgButton {
  setText(text: string): void;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  showProgress?(leaveActive?: boolean): void;
  hideProgress?(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  setParams?(p: Record<string, unknown>): void;
}

interface TgWebApp {
  ready(): void;
  expand(): void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string | undefined>;
  initData: string;
  initDataUnsafe?: { user?: { language_code?: string } };
  platform: string;
  version: string;
  BackButton: TgButton;
  MainButton: TgButton;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    selectionChanged(): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  isVersionAtLeast?(v: string): boolean;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

interface MainButtonSpec {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}

interface TmaValue {
  /** Открыто внутри Telegram (есть initData). */
  inTelegram: boolean;
  setMainButton: (spec: MainButtonSpec | null) => void;
  openLink: (url: string) => void;
  haptic: (kind?: "selection" | "light" | "success") => void;
}

const TmaContext = createContext<TmaValue | null>(null);

/** Сопоставление themeParams Telegram с токенами. Акцент (--color-accent) не трогаем — фирменный. */
const THEME_MAP: [string, string][] = [
  ["bg_color", "--color-bg"],
  ["secondary_bg_color", "--color-surface-2"],
  ["section_bg_color", "--color-surface"],
  ["text_color", "--color-ink"],
  ["hint_color", "--color-ink-2"],
  ["section_separator_color", "--color-line"],
];

function getWebApp(): TgWebApp | null {
  return typeof window !== "undefined" ? (window.Telegram?.WebApp ?? null) : null;
}

export function TmaProvider({ children, rootPath }: { children: ReactNode; rootPath: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [inTelegram, setInTelegram] = useState(false);
  const mainHandler = useRef<(() => void) | null>(null);

  // Ждём telegram-web-app.js, применяем тему и подписываемся на её смену.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const applyTheme = (app: TgWebApp) => {
      const root = document.documentElement;
      root.setAttribute("data-theme", app.colorScheme === "dark" ? "dark" : "light");
      for (const [param, cssVar] of THEME_MAP) {
        const v = app.themeParams[param];
        if (v && /^#[0-9a-f]{3,8}$/i.test(v)) root.style.setProperty(cssVar, v);
      }
      if (app.themeParams.bg_color) app.setHeaderColor?.(app.themeParams.bg_color);
    };
    const init = () => {
      const app = getWebApp();
      if (!app) {
        if (attempts++ < 40 && !cancelled) setTimeout(init, 100);
        return;
      }
      if (!app.initData) return; // скрипт загружен, но страница открыта не в Telegram
      setInTelegram(true);
      document.documentElement.setAttribute("data-tma", "true");
      app.ready();
      app.expand();
      applyTheme(app);
      const onTheme = () => applyTheme(app);
      app.onEvent("themeChanged", onTheme);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // BackButton: на вложенных экранах — назад по истории.
  useEffect(() => {
    const app = getWebApp();
    if (!inTelegram || !app) return;
    const onBack = () => {
      app.HapticFeedback?.impactOccurred("light");
      if (window.history.length > 1) router.back();
      else router.push(rootPath);
    };
    const isRoot = pathname === rootPath;
    if (isRoot) app.BackButton.hide();
    else app.BackButton.show();
    app.BackButton.onClick(onBack);
    return () => app.BackButton.offClick(onBack);
  }, [inTelegram, pathname, rootPath, router]);

  // Тактильный отклик на нажатия ссылок и кнопок.
  useEffect(() => {
    const app = getWebApp();
    if (!inTelegram || !app?.HapticFeedback) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest(
        "a, button, [role=tab], input[type=checkbox], input[type=radio]",
      );
      if (el) app.HapticFeedback?.selectionChanged();
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [inTelegram]);

  const setMainButton = useCallback(
    (spec: MainButtonSpec | null) => {
      const app = getWebApp();
      if (!inTelegram || !app) return;
      if (mainHandler.current) app.MainButton.offClick(mainHandler.current);
      mainHandler.current = null;
      if (!spec) {
        app.MainButton.hide();
        return;
      }
      const handler = () => {
        app.HapticFeedback?.impactOccurred("medium");
        spec.onClick();
      };
      mainHandler.current = handler;
      app.MainButton.setText(spec.text);
      app.MainButton.onClick(handler);
      if (spec.disabled) app.MainButton.disable();
      else app.MainButton.enable();
      app.MainButton.show();
    },
    [inTelegram],
  );

  const value = useMemo<TmaValue>(
    () => ({
      inTelegram,
      setMainButton,
      openLink: (url) => {
        const app = getWebApp();
        if (inTelegram && app) app.openLink(url);
        else window.open(url, "_blank", "noopener");
      },
      haptic: (kind = "selection") => {
        const h = getWebApp()?.HapticFeedback;
        if (!inTelegram || !h) return;
        if (kind === "selection") h.selectionChanged();
        else if (kind === "success") h.notificationOccurred("success");
        else h.impactOccurred("light");
      },
    }),
    [inTelegram, setMainButton],
  );

  return <TmaContext.Provider value={value}>{children}</TmaContext.Provider>;
}

export function useTma(): TmaValue | null {
  return useContext(TmaContext);
}

/** Главная кнопка Telegram для экрана; вне Mini App ничего не делает. */
export function useMainButton(spec: MainButtonSpec | null) {
  const tma = useTma();
  const text = spec?.text;
  const disabled = spec?.disabled;
  const cb = useRef(spec?.onClick);
  cb.current = spec?.onClick;
  useEffect(() => {
    if (!tma) return;
    tma.setMainButton(text ? { text, disabled, onClick: () => cb.current?.() } : null);
    return () => tma.setMainButton(null);
  }, [tma, text, disabled]);
}

/** Кнопка «Купить билеты» в Mini App: MainButton внутри Telegram, обычная ссылка в браузере. */
export function TmaTicketButton({ url, label }: { url: string | null; label: string }) {
  const tma = useTma();
  useMainButton(url ? { text: label, onClick: () => tma?.openLink(url) } : null);
  if (!url || tma?.inTelegram) return null;
  return (
    <a className="btn btn--primary btn--block" href={url} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
