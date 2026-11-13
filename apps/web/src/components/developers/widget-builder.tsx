"use client";
/**
 * Конструктор виджета: параметры → живой предпросмотр (настоящий <afisha-rb> или iframe) → «Скопировать код».
 */
import type { Category, CategoryCode, Municipality } from "@afisha/contract";
import { colors } from "@afisha/design-tokens";
import type { Lang } from "@afisha/i18n";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { API_BASE, SITE_URL, WIDGET_SRC } from "@/lib/config";
import { useI18n } from "@/lib/i18n-client";
import { CATEGORY_CODES, CHILD_AGES } from "@/lib/search-params";
import {
  componentSnippet,
  DEFAULT_RADIUS,
  embedQuery,
  iframeSnippet,
  LAYOUTS,
  type Layout,
  THEMES,
  type WidgetOptions,
  type WidgetTheme,
  widgetAttributes,
} from "@/lib/widget-snippet";
import { CodeBlock } from "./code-block";
import styles from "./widget-builder.module.css";

const DEFAULT_ACCENT = colors["color-accent"].light;
/** Предпросмотр грузит бандл с этого же сайта — так конструктор работает и до выкладки на CDN. */
const PREVIEW_SRC = "/widget/v1/afisha.js";

export function WidgetBuilder({
  municipalities,
  categories,
}: {
  municipalities: Municipality[];
  categories: Category[];
}) {
  const { lang, t } = useI18n();
  const uid = useId();
  const [mode, setMode] = useState<"component" | "iframe">("component");
  const [o, setO] = useState<WidgetOptions>({
    municipality: "ufa",
    categories: [],
    free: false,
    pushkin: false,
    age: "",
    limit: 6,
    layout: "carousel",
    lang,
    theme: "auto",
    accent: DEFAULT_ACCENT,
    radius: DEFAULT_RADIUS,
    organization: "",
    venue: "",
  });
  const [scriptState, setScriptState] = useState<"loading" | "ready" | "failed">("loading");
  const host = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(420);
  const set = <K extends keyof WidgetOptions>(k: K, v: WidgetOptions[K]) => setO((prev) => ({ ...prev, [k]: v }));

  // Бандл виджета подключается один раз.
  useEffect(() => {
    if (customElements.get("afisha-rb")) {
      setScriptState("ready");
      return;
    }
    const s = document.createElement("script");
    s.type = "module";
    s.src = PREVIEW_SRC;
    s.onload = () => setScriptState("ready");
    s.onerror = () => {
      setScriptState("failed");
      setMode("iframe");
    };
    document.head.appendChild(s);
  }, []);

  // Живой предпросмотр веб-компонента: элемент пересоздаётся при смене параметров.
  useEffect(() => {
    if (mode !== "component" || scriptState !== "ready" || !host.current) return;
    const el = document.createElement("afisha-rb");
    for (const [k, v] of widgetAttributes(o, { accent: DEFAULT_ACCENT })) el.setAttribute(k, v);
    el.setAttribute("api-base", API_BASE);
    el.setAttribute("site-base", window.location.origin);
    host.current.replaceChildren(el);
  }, [o, mode, scriptState]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "afisha:height")
        setFrameHeight(Number(e.data.height) || 420);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const catTitle = new Map(categories.map((c) => [c.code, c.title]));
  const snippet = useMemo(
    () =>
      mode === "component"
        ? componentSnippet(o, { widgetSrc: WIDGET_SRC, apiBase: API_BASE, accent: DEFAULT_ACCENT })
        : iframeSnippet(o, { siteUrl: SITE_URL, accent: DEFAULT_ACCENT, title: t("widget.title") }),
    [o, mode, t],
  );
  const toggleCat = (c: CategoryCode) =>
    set("categories", o.categories.includes(c) ? o.categories.filter((x) => x !== c) : [...o.categories, c]);
  const sorted = [...municipalities].sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name, "ru") : a.kind === "city" ? -1 : 1,
  );

  return (
    <div className={styles.builder}>
      <form className={styles.controls} onSubmit={(e) => e.preventDefault()} aria-label={t("developers.builder")}>
        <fieldset className={styles.group}>
          <legend>{t("developers.mode")}</legend>
          <div className={styles.row}>
            {(["component", "iframe"] as const).map((m) => (
              <label key={m} className="check">
                <input
                  type="radio"
                  name={`${uid}-mode`}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  disabled={m === "component" && scriptState === "failed"}
                />
                <span>{m === "component" ? t("developers.modeComponent") : t("developers.modeIframe")}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor={`${uid}-muni`}>{t("search.place")}</label>
          <select
            id={`${uid}-muni`}
            className="select"
            value={o.municipality}
            onChange={(e) => set("municipality", e.target.value)}
          >
            <option value="">{t("search.allPlaces")}</option>
            {sorted.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className={styles.group}>
          <legend>{t("search.category")}</legend>
          <div className={styles.row}>
            {CATEGORY_CODES.map((c) => (
              <label key={c} className="check">
                <input type="checkbox" checked={o.categories.includes(c)} onChange={() => toggleCat(c)} />
                <span>{catTitle.get(c) ?? t(`categories.${c}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.grid2}>
          <div className="field">
            <label htmlFor={`${uid}-layout`}>{t("developers.layout")}</label>
            <select
              id={`${uid}-layout`}
              className="select"
              value={o.layout}
              onChange={(e) => set("layout", e.target.value as Layout)}
            >
              {LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {t(`developers.layout${l[0]!.toUpperCase()}${l.slice(1)}` as "developers.layoutList")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-limit`}>{t("developers.limit")}</label>
            <input
              id={`${uid}-limit`}
              type="number"
              min={1}
              max={24}
              className="input"
              value={o.limit}
              onChange={(e) => set("limit", Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-lang`}>{t("developers.lang")}</label>
            <select
              id={`${uid}-lang`}
              className="select"
              value={o.lang}
              onChange={(e) => set("lang", e.target.value as Lang)}
            >
              <option value="ru">Русский</option>
              <option value="ba" lang="ba">
                Башҡортса
              </option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-theme`}>{t("developers.theme")}</label>
            <select
              id={`${uid}-theme`}
              className="select"
              value={o.theme}
              onChange={(e) => set("theme", e.target.value as WidgetTheme)}
            >
              {THEMES.map((th) => (
                <option key={th} value={th}>
                  {th === "auto"
                    ? t("developers.themeAuto")
                    : th === "light"
                      ? t("settings.themeLight")
                      : t("settings.themeDark")}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-accent`}>{t("developers.accent")}</label>
            <input
              id={`${uid}-accent`}
              type="color"
              className={`input ${styles.color}`}
              value={o.accent}
              onChange={(e) => set("accent", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-radius`}>{t("developers.radius")}</label>
            <input
              id={`${uid}-radius`}
              type="number"
              min={0}
              max={32}
              className="input"
              value={o.radius}
              onChange={(e) => set("radius", Math.max(0, Math.min(32, Number(e.target.value) || 0)))}
            />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-age`}>{t("search.age")}</label>
            <select id={`${uid}-age`} className="select" value={o.age} onChange={(e) => set("age", e.target.value)}>
              <option value="">{t("search.ageAny")}</option>
              {CHILD_AGES.map((a) => (
                <option key={a} value={a}>
                  {t("search.ageYears", { age: a })}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.row}>
          <label className="check">
            <input type="checkbox" checked={o.free} onChange={(e) => set("free", e.target.checked)} />
            <span>{t("search.free")}</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={o.pushkin} onChange={(e) => set("pushkin", e.target.checked)} />
            <span>{t("search.pushkin")}</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor={`${uid}-org`}>{t("developers.organization")}</label>
          <input
            id={`${uid}-org`}
            className="input"
            value={o.organization}
            onChange={(e) => set("organization", e.target.value)}
            placeholder="01a19c9d-…"
            aria-describedby={`${uid}-org-hint`}
            spellCheck={false}
          />
          <p id={`${uid}-org-hint`} className="caption">
            {t("developers.organizationHint")}
          </p>
        </div>
      </form>

      <div className={styles.output}>
        <section aria-labelledby={`${uid}-preview`} className={styles.preview}>
          <h3 id={`${uid}-preview`}>{t("developers.preview")}</h3>
          <div className={styles.stage} data-theme-preview={o.theme}>
            {mode === "component" ? (
              <div ref={host} className={styles.host} data-testid="widget-preview">
                {scriptState === "loading" ? <p className="muted">{t("common.loading")}</p> : null}
              </div>
            ) : (
              <iframe
                title={t("widget.title")}
                src={`/embed?${embedQuery(o, { accent: DEFAULT_ACCENT })}`}
                className={styles.frame}
                style={{ height: frameHeight }}
              />
            )}
          </div>
        </section>
        <CodeBlock
          code={snippet}
          label={mode === "component" ? t("developers.snippet") : t("developers.snippetIframe")}
          language="html"
        />
      </div>
    </div>
  );
}
