/**
 * Код вставки виджета для конструктора на /developers (03-functional-spec §6.2):
 * Web Component <afisha-rb> и запасной iframe с автоподбором высоты через postMessage.
 */
import type { CategoryCode } from "@afisha/contract";
import type { Lang } from "@afisha/i18n";

export const LAYOUTS = ["carousel", "list", "grid", "compact"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const THEMES = ["auto", "light", "dark"] as const;
export type WidgetTheme = (typeof THEMES)[number];

export interface WidgetOptions {
  municipality: string;
  categories: CategoryCode[];
  free: boolean;
  pushkin: boolean;
  age: string;
  limit: number;
  layout: Layout;
  lang: Lang;
  theme: WidgetTheme;
  accent: string;
  radius: number;
  organization: string;
  venue: string;
}

export const DEFAULT_RADIUS = 14;

export function widgetAttributes(o: WidgetOptions, defaults: { accent: string }): [string, string][] {
  const attrs: [string, string][] = [];
  if (o.municipality) attrs.push(["municipality", o.municipality]);
  if (o.venue.trim()) attrs.push(["venue", o.venue.trim()]);
  if (o.organization.trim()) attrs.push(["organization", o.organization.trim()]);
  if (o.categories.length) attrs.push(["categories", o.categories.join(",")]);
  if (o.free) attrs.push(["free", "true"]);
  if (o.pushkin) attrs.push(["pushkin", "true"]);
  if (o.age !== "") attrs.push(["age", o.age]);
  attrs.push(["layout", o.layout]);
  attrs.push(["limit", String(o.limit)]);
  attrs.push(["lang", o.lang]);
  attrs.push(["theme", o.theme]);
  if (o.accent && o.accent.toLowerCase() !== defaults.accent.toLowerCase()) attrs.push(["accent", o.accent]);
  if (o.radius !== DEFAULT_RADIUS) attrs.push(["radius", String(o.radius)]);
  return attrs;
}

const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function componentSnippet(
  o: WidgetOptions,
  env: { widgetSrc: string; apiBase: string; accent: string },
): string {
  const attrs = [...widgetAttributes(o, env), ["api-base", env.apiBase] as [string, string]];
  const lines = attrs.map(([k, v]) => `  ${k}="${escAttr(v)}"`).join("\n");
  return `<script src="${env.widgetSrc}" type="module" async></script>\n<afisha-rb\n${lines}>\n</afisha-rb>`;
}

export function embedQuery(o: WidgetOptions, env: { accent: string }): string {
  return new URLSearchParams(widgetAttributes(o, env)).toString();
}

export function iframeSnippet(o: WidgetOptions, env: { siteUrl: string; accent: string; title: string }): string {
  const src = `${env.siteUrl}/embed?${embedQuery(o, env)}`;
  const origin = new URL(env.siteUrl).origin;
  return [
    `<iframe id="afisha-rb-frame" src="${escAttr(src)}" title="${escAttr(env.title)}" loading="lazy"`,
    `  style="display:block;width:100%;min-height:360px;border:0"></iframe>`,
    `<script>`,
    `  window.addEventListener("message", function (e) {`,
    `    if (e.origin !== "${origin}" || !e.data || e.data.type !== "afisha:height") return;`,
    `    document.getElementById("afisha-rb-frame").style.height = e.data.height + "px";`,
    `  });`,
    `</script>`,
  ].join("\n");
}
