/**
 * Карточка события (07-design §7): постер со срезом ҡусҡар, дата в ромбе, название в две строки,
 * площадка и район, чипы цены, возраста и Пушкинской карты, статус-бейдж, кайма цвета категории.
 * Без хуков: работает и в серверных, и в клиентских компонентах.
 */
import type { OccurrenceCard } from "@afisha/contract";
import type { Lang, Translate } from "@afisha/i18n";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cardSpeech, dateBadge, decodeEntities, priceShort, statusKind, statusLabel } from "@/lib/format";
import type { Hrefs } from "@/lib/hrefs";
import { DateRhombus } from "./date-rhombus";
import styles from "./event-card.module.css";
import { Poster } from "./poster";
import { StatusBadge } from "./status-badge";

export interface CardContext {
  lang: Lang;
  t: Translate;
  tz: string;
  /** «Сегодня» в поясе региона, YYYY-MM-DD */
  today: string;
  hrefs: Hrefs;
}

/** Язык текстов событий из источников: пока все описания на русском (см. отчёт: нужен title_lang в API). */
export const CONTENT_LANG = "ru";

export function EventCard({
  item,
  ctx,
  variant = "default",
  priority = false,
  footer,
  headingLevel = 3,
}: {
  item: OccurrenceCard;
  ctx: CardContext;
  variant?: "default" | "compact";
  priority?: boolean;
  footer?: ReactNode;
  headingLevel?: 2 | 3 | 4;
}) {
  const { t, lang, tz, today, hrefs } = ctx;
  const e = item.event;
  const category = e.categories[0] ?? "education";
  const kind = statusKind(item);
  const status = statusLabel(item, t, lang, tz);
  const badge = dateBadge(item, lang, tz, today);
  const speech = cardSpeech(item, t, lang, tz, today);
  const rest = speech.slice(e.title.length);
  const Heading = `h${headingLevel}` as const;
  const place = [item.venue?.name, item.venue?.municipality].filter(Boolean).join(" · ");
  const style = { "--cat": `var(--color-category-${category})` } as CSSProperties;

  return (
    <article
      className={`${styles.card} ${variant === "compact" ? styles.compact : ""}`}
      data-status={kind ?? undefined}
      style={style}
    >
      <div className={styles.media}>
        <Poster
          image={e.image}
          category={category}
          seed={e.id}
          alt=""
          sizes={variant === "compact" ? "120px" : "(min-width: 1280px) 300px, (min-width: 600px) 45vw, 92vw"}
          priority={priority}
          dim={item.status === "cancelled" || item.status === "ended"}
        />
        {kind && status ? (
          <div className={styles.status} aria-hidden="true">
            <StatusBadge kind={kind} label={status} />
          </div>
        ) : null}
      </div>
      <div className={styles.body}>
        <DateRhombus
          className={styles.date}
          top={badge.top}
          day={badge.day}
          bottom={badge.bottom}
          crossed={item.status === "cancelled"}
        />
        <Heading className={styles.title}>
          <Link
            href={hrefs.event(e.id)}
            className={styles.link}
            prefetch={false}
            {...(hrefs.external ? { target: "_blank", rel: "noopener" } : {})}
          >
            <span lang={lang === CONTENT_LANG ? undefined : CONTENT_LANG}>{e.title}</span>
            <span className="sr-only">{rest}</span>
          </Link>
        </Heading>
        <div aria-hidden="true" className={styles.meta}>
          {variant === "compact" ? <p className={styles.when}>{badge.label}</p> : null}
          {place ? (
            <p className={styles.place} lang={lang === CONTENT_LANG ? undefined : CONTENT_LANG}>
              {decodeEntities(place)}
            </p>
          ) : null}
          <ul className={`chips ${styles.chips}`}>
            <li className={`chip ${e.price.is_free ? "chip--free" : ""}`}>{priceShort(e.price, t)}</li>
            <li className="chip chip--age">{t("common.age", { age: e.age_rating })}</li>
            {e.pushkin_card ? <li className={`chip ${styles.pushkin}`}>{t("common.pushkin")}</li> : null}
            {item.more_dates > 0 ? <li className="chip">{t("card.moreDates", { count: item.more_dates })}</li> : null}
          </ul>
        </div>
        {footer}
      </div>
    </article>
  );
}

export function CardSkeleton({ variant = "default" }: { variant?: "default" | "compact" }) {
  return (
    <div
      className={`${styles.card} ${styles.skeletonCard} ${variant === "compact" ? styles.compact : ""}`}
      aria-hidden="true"
    >
      <div className={`${styles.media} skeleton`} />
      <div className={styles.body}>
        <div className="skeleton" style={{ height: 20, width: "85%" }} />
        <div className="skeleton" style={{ height: 20, width: "60%", marginTop: 8 }} />
        <div className="skeleton" style={{ height: 14, width: "70%", marginTop: 16 }} />
      </div>
    </div>
  );
}
