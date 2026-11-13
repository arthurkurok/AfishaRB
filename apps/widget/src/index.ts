/**
 * <afisha-rb> — встраиваемая афиша культуры Башкортостана (03-functional-spec §6.2, ADR-012).
 * Shadow DOM, без cookies, localStorage и трекеров: запрос к открытому API с credentials: "omit".
 *
 *   <script src="https://<домен>/widget/v1/afisha.js" type="module" async></script>
 *   <afisha-rb municipality="ufa" categories="theatre,music" layout="carousel" limit="8" lang="ru" theme="auto"></afisha-rb>
 */
import type { SearchResult } from "@afisha/contract";
import { wt } from "./i18n";
import { apiQuery, OBSERVED, parseOptions, type WidgetOptions } from "./options";
import { listHtml, loadingHtml, shellHtml, stateHtml } from "./render";
import { TOKENS_CSS, WIDGET_CSS } from "./styles";

function luminance(hex: string): number {
  const h = hex.length === 4 ? [...hex.slice(1)].map((c) => c + c).join("") : hex.slice(1);
  const ch = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
}

/** Пользовательские акцент и скругления — поверх токенов. Цвет текста на акценте выбирается по контрасту. */
function customCss(o: WidgetOptions): string {
  const rules: string[] = [];
  if (o.accent) {
    const onAccent = luminance(o.accent) > 0.4 ? "var(--color-ink)" : "var(--color-on-category)";
    rules.push(`--color-accent:${o.accent}`, `--color-on-accent:${onAccent}`);
  }
  if (o.radius !== null) rules.push(`--radius-l:${o.radius}px`, `--radius-m:${Math.round(o.radius * 0.65)}px`);
  return rules.length ? `:host{${rules.join(";")}}` : "";
}

export class AfishaRb extends HTMLElement {
  static observedAttributes = [...OBSERVED];
  private readonly root: ShadowRoot;
  private abort: AbortController | null = null;
  private scheduled = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.schedule();
  }

  disconnectedCallback() {
    this.abort?.abort();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.schedule();
  }

  /** Перерисовать и перезапросить (например, после смены атрибутов). */
  refresh() {
    this.schedule();
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.load();
    });
  }

  private options(): WidgetOptions {
    return parseOptions((name) => this.getAttribute(name), {
      apiBase: __API_BASE__,
      siteBase: __SITE_BASE__,
      lang: this.closest("[lang]")?.getAttribute("lang") ?? undefined,
    });
  }

  private paint(opts: WidgetOptions, inner: string, carousel = false) {
    this.root.innerHTML = `<style>${TOKENS_CSS}${WIDGET_CSS}${customCss(opts)}</style>${shellHtml(opts, inner, carousel)}`;
  }

  private async load() {
    const opts = this.options();
    this.abort?.abort();
    const controller = new AbortController();
    this.abort = controller;
    this.paint(opts, loadingHtml(opts));
    try {
      const res = await fetch(`${opts.apiBase}/v1/occurrences?${apiQuery(opts)}`, {
        credentials: "omit",
        signal: controller.signal,
        headers: { accept: "application/json", "x-afisha-channel": "widget" },
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as SearchResult;
      if (controller.signal.aborted) return;
      if (!data.items.length) {
        this.paint(opts, stateHtml(wt(opts.lang, "empty")));
        return;
      }
      const carousel = opts.layout === "carousel";
      this.paint(opts, listHtml(data.items, opts), carousel && data.items.length > 1);
      if (carousel) this.wireCarousel();
      this.dispatchEvent(new CustomEvent("afisha:loaded", { detail: { count: data.items.length, total: data.total } }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      this.paint(opts, stateHtml(wt(opts.lang, "error"), "↻"));
      this.root.querySelector(".retry")?.addEventListener("click", () => this.schedule());
      this.root.querySelector(".retry")?.setAttribute("aria-label", wt(opts.lang, "error"));
    }
  }

  /** Карусель: кнопки «назад/вперёд», состояние disabled по положению прокрутки, стрелки — нативная прокрутка. */
  private wireCarousel() {
    const list = this.root.querySelector<HTMLElement>(".list");
    const prev = this.root.querySelector<HTMLButtonElement>(".prev");
    const next = this.root.querySelector<HTMLButtonElement>(".next");
    if (!list || !prev || !next) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const update = () => {
      prev.disabled = list.scrollLeft <= 2;
      next.disabled = list.scrollLeft + list.clientWidth >= list.scrollWidth - 2;
    };
    const step = (dir: number) =>
      list.scrollBy({ left: dir * list.clientWidth * 0.9, behavior: reduce ? "auto" : "smooth" });
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    list.addEventListener("scroll", update, { passive: true });
    update();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("afisha-rb")) {
  customElements.define("afisha-rb", AfishaRb);
}
