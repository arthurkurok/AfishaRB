/**
 * Стили виджета внутри Shadow DOM: CSS-переменные из packages/design-tokens (светлая и тёмная темы),
 * никаких глобальных стилей на странице сайта. Шрифт наследуется от сайта (07-design §13).
 */
import { baseVars, darkVars, lightVars } from "@afisha/design-tokens";

const decl = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");

export const TOKENS_CSS = `:host{${decl(lightVars)};${decl(baseVars)};color-scheme:light}:host([theme=dark]){${decl(darkVars)};color-scheme:dark}@media (prefers-color-scheme:dark){:host(:not([theme=light])){${decl(darkVars)};color-scheme:dark}}`;

export const WIDGET_CSS = `
:host{display:block;contain:content;font:inherit;color:var(--color-ink);--widget-min-height:360px}
:host([hidden]){display:none}
*,*::before,*::after{box-sizing:border-box}
.w{background:var(--color-bg);border-radius:var(--radius-l);padding:var(--space-4);font-family:inherit;line-height:1.4;min-height:var(--widget-min-height)}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:var(--space-2);margin:0 0 var(--space-3)}
h2{margin:0;font-size:var(--type-title-size);line-height:var(--type-title-line);font-weight:700}
a{color:var(--color-accent)}
.all{font-weight:600;min-height:44px;display:inline-flex;align-items:center}
.list{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-3)}
.grid .list{grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))}
.carousel .list{grid-auto-flow:column;grid-auto-columns:minmax(220px,260px);overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;padding:2px 2px var(--space-2)}
.carousel .list>li{scroll-snap-align:start}
.card{--cat:var(--color-accent);position:relative;display:flex;flex-direction:column;height:100%;background:var(--color-surface);border:1px solid var(--color-line);border-bottom:4px solid var(--cat);border-radius:var(--radius-l);overflow:hidden;color:var(--color-ink);text-decoration:none}
.card:hover{box-shadow:0 6px 20px color-mix(in srgb,var(--color-ink) 14%,transparent)}
.card:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
.media{position:relative;aspect-ratio:16/9;background:var(--cat);overflow:hidden}
.media img{width:100%;height:100%;object-fit:cover;display:block}
.art{position:absolute;inset:0;background:var(--color-honey);opacity:.4;-webkit-mask:var(--rh) 0 0/28px 28px;mask:var(--rh) 0 0/28px 28px}
:host{--rh:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2728%27 height=%2728%27%3E%3Cpath d=%27M14 4l8 10-8 10-8-10z%27/%3E%3C/svg%3E")}
.cut{position:absolute;top:-1px;right:-1px;width:30px;height:30px;background:var(--color-surface);border-bottom-left-radius:100%}
.body{display:flex;flex-direction:column;gap:6px;padding:var(--space-3) var(--space-3) var(--space-3);flex:1}
.date{display:flex;align-items:center;gap:var(--space-2);font-size:var(--type-caption-size);font-weight:700}
.date::before{content:"";width:10px;height:10px;flex:none;background:var(--cat);transform:rotate(45deg)}
.title{font-weight:700;font-size:var(--type-body-size);line-height:var(--type-body-line);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.place{font-size:var(--type-caption-size);color:var(--color-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:auto;padding-top:4px}
.chip{display:inline-flex;align-items:center;min-height:26px;padding:0 8px;border-radius:var(--radius-pill);border:1px solid var(--color-line);font-size:var(--type-caption-size);font-weight:600;white-space:nowrap}
.age{border-color:var(--color-ink)}
.free{border-color:var(--color-meadow);color:var(--color-meadow)}
.st{border-width:2px;border-color:currentColor}
.st-cancelled{color:var(--color-status-cancelled)}
.st-rescheduled,.st-postponed{color:var(--color-status-rescheduled)}
.st-sold_out,.st-ended{color:var(--color-status-ended)}
.st-unverified{color:var(--color-status-unverified)}
.st-few_left{background:var(--color-honey);border-color:var(--color-honey);color:var(--color-ink)}
:host([theme=dark]) .st-few_left{color:var(--color-bg)}
@media (prefers-color-scheme:dark){:host(:not([theme=light])) .st-few_left{color:var(--color-bg)}}
.cancelled .title{text-decoration:line-through;color:var(--color-ink-2)}
.cancelled img{filter:grayscale(1)}
.list-l .card,.compact .card{flex-direction:row}
.list-l .media{flex:0 0 112px;aspect-ratio:auto;min-height:100%}
.compact .media{display:none}
.compact .list{gap:var(--space-2)}
.compact .title{-webkit-line-clamp:2;font-size:var(--type-caption-size);line-height:var(--type-caption-line)}
.compact .chips{display:none}
.nav{display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-2)}
button{font:inherit;min-width:44px;min-height:44px;border-radius:var(--radius-pill);border:1px solid var(--color-line);background:var(--color-surface);color:var(--color-ink);cursor:pointer}
button:hover:not(:disabled){border-color:var(--color-ink-2)}
button:disabled{opacity:.4;cursor:default}
button:focus-visible,.list:focus-visible,.all:focus-visible{outline:2px solid var(--color-focus);outline-offset:2px}
.retry{padding:0 var(--space-4);margin-top:var(--space-2);background:var(--color-accent);color:var(--color-on-accent);border-color:var(--color-accent)}
.state{padding:var(--space-4);border:1px dashed var(--color-line);border-radius:var(--radius-m);color:var(--color-ink-2)}
.sk{background:var(--color-surface-2);border-radius:var(--radius-m);min-height:120px;animation:p 1.2s ease-in-out infinite alternate}
@keyframes p{to{opacity:.55}}
.foot{margin:var(--space-3) 0 0;font-size:var(--type-caption-size);color:var(--color-ink-2)}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media (max-width:420px){.list-l .media{flex-basis:88px}}
`;
