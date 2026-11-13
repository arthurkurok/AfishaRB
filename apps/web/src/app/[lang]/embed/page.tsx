/**
 * iframe-фоллбэк виджета (03-functional-spec §6.2): для сайтов со строгой CSP или без пользовательского JS.
 * Параметры — те же, что атрибуты <afisha-rb>. Ссылки открывают карточку на сайте в новой вкладке.
 */
import { colors } from "@afisha/design-tokens";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { EventCard } from "@/components/event/event-card";
import { safe, searchOccurrences } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { contrastRatio } from "@/lib/color";
import { SITE_URL } from "@/lib/config";
import { createT, resolveLang } from "@/lib/i18n";
import { CATEGORY_CODES, TAG_CODES } from "@/lib/search-params";
import styles from "./embed.module.css";
import { EmbedResizer } from "./resizer";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EmbedPage({ params, searchParams }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const sp = await searchParams;
  const layout = (["carousel", "list", "grid", "compact"] as const).find((l) => l === one(sp.layout)) ?? "list";
  const theme = (["auto", "light", "dark"] as const).find((x) => x === one(sp.theme)) ?? "auto";
  const limit = Math.min(24, Math.max(1, Number(one(sp.limit)) || 6));
  const q = new URLSearchParams({ lang, limit: String(limit), when: "month" });
  const slug = one(sp.municipality);
  if (/^[a-z0-9-]{2,80}(,[a-z0-9-]{2,80})*$/.test(slug)) q.set("municipality", slug);
  for (const key of ["venue", "organization"]) {
    const v = one(sp[key]);
    if (/^[0-9a-f-]{36}$/i.test(v)) q.set(key, v);
  }
  const cats = one(sp.categories)
    .split(",")
    .filter((c) => (CATEGORY_CODES as readonly string[]).includes(c));
  if (cats.length) q.set("categories", cats.join(","));
  const tags = one(sp.tags)
    .split(",")
    .filter((c) => (TAG_CODES as readonly string[]).includes(c));
  if (tags.length) q.set("tags", tags.join(","));
  if (one(sp.free) === "true") q.set("free", "true");
  if (one(sp.pushkin) === "true") q.set("pushkin", "true");
  const age = Number(one(sp.age));
  if (one(sp.age) !== "" && Number.isInteger(age) && age >= 0 && age <= 17) q.set("age", String(age));

  const accent = one(sp.accent);
  const radius = Number(one(sp.radius));
  const style: Record<string, string> = {};
  if (/^#[0-9a-f]{6}$/i.test(accent)) {
    style["--color-accent"] = accent;
    // Текст на акценте — светлый или тёмный, что контрастнее.
    style["--color-on-accent"] =
      contrastRatio(accent, colors["color-surface"].light) >= contrastRatio(accent, colors["color-ink"].light)
        ? colors["color-surface"].light
        : colors["color-ink"].light;
  }
  if (Number.isFinite(radius) && one(sp.radius) !== "" && radius >= 0 && radius <= 32) {
    style["--radius-l"] = `${radius}px`;
    style["--radius-m"] = `${Math.round(radius * 0.65)}px`;
  }

  const result = await safe(searchOccurrences(q, { revalidate: 300 }));
  const ctx = cardContext(lang, t, "embed");
  const variant = layout === "list" || layout === "compact" ? "compact" : "default";
  const listClass = layout === "carousel" ? "rail" : layout === "grid" ? "card-grid" : styles.list;
  return (
    <div className={`${styles.embed} ${styles[layout]}`} style={style as CSSProperties}>
      <EmbedResizer theme={theme} />
      <h1 className={styles.title}>{t("widget.title")}</h1>
      {!result ? (
        <p role="alert">{t("widget.error")}</p>
      ) : result.items.length === 0 ? (
        <p>{t("widget.empty")}</p>
      ) : (
        <ul className={listClass}>
          {result.items.map((item) => (
            <li key={item.id}>
              <EventCard item={item} ctx={ctx} variant={variant} headingLevel={2} />
            </li>
          ))}
        </ul>
      )}
      <p className={styles.foot}>
        <a href={`${SITE_URL}${lang === "ba" ? "/ba" : ""}/search?${q.toString()}`} target="_blank" rel="noopener">
          {t("widget.all")} →<span className="sr-only"> {t("common.newTab")}</span>
        </a>
        <span className="caption">{t("widget.powered")}</span>
      </p>
    </div>
  );
}
