import Link from "next/link";
import { notFound } from "next/navigation";
import { DateRhombus } from "@/components/event/date-rhombus";
import { Collapsible, ReportButton, ShareButton } from "@/components/event/event-actions";
import { CONTENT_LANG } from "@/components/event/event-card";
import { Passport } from "@/components/event/passport";
import { Poster } from "@/components/event/poster";
import { Sessions } from "@/components/event/sessions";
import { StatusBadge } from "@/components/event/status-badge";
import { TmaTicketButton } from "@/components/tma/tma-provider";
import { ApiError, getEvent } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { REGION_TZ, SITE_URL } from "@/lib/config";
import { dateBadge, decodeEntities, isInactive, priceLabel, statusKind, statusLabel } from "@/lib/format";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "./tma-event.module.css";

export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

/** Паспорт события в Mini App: компактно, «Купить билеты» — главная кнопка Telegram. */
export default async function TmaEvent({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { id } = await params;
  const lang = await resolveLang(params);
  const t = createT(lang);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const event = await getEvent(id, lang).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const ctx = cardContext(lang, t, "tma");
  const next = event.occurrences.find((o) => !isInactive(o.status)) ?? event.occurrences[0];
  const category = event.categories[0] ?? "education";
  const kind = next ? statusKind(next) : null;
  const status = next ? statusLabel(next, t, lang, REGION_TZ) : null;
  const badge = next ? dateBadge(next, lang, REGION_TZ, ctx.today) : null;
  const ticket =
    next && !["cancelled", "ended", "sold_out", "postponed"].includes(next.status)
      ? (next.ticket_url ?? event.ticket_url)
      : null;
  const contentLang = lang === CONTENT_LANG ? undefined : CONTENT_LANG;
  return (
    <article className={styles.page} style={{ ["--cat" as string]: `var(--color-category-${category})` }}>
      <div className={styles.media}>
        <Poster
          image={event.image}
          category={category}
          alt={t("card.coverAlt", { title: event.title })}
          sizes="100vw"
          priority
        />
      </div>
      <ul className="chips">
        <li className="chip chip--age">{t("common.age", { age: event.age_rating })}</li>
        <li className="chip">{t(`categories.${category}`)}</li>
        {event.pushkin_card ? <li className="chip">{t("common.pushkin")}</li> : null}
      </ul>
      {kind && status ? <StatusBadge kind={kind} label={status} size="l" /> : null}
      <h1 className={styles.title} lang={contentLang}>
        {event.title}
      </h1>
      {next && badge ? (
        <div className={styles.when}>
          <DateRhombus top={badge.top} day={badge.day} bottom={badge.bottom} crossed={next.status === "cancelled"} />
          <div>
            <p className={styles.whenText}>{badge.label}</p>
            {next.venue ? (
              <p className="muted" lang={contentLang}>
                {decodeEntities(next.venue.name)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <p className={styles.price}>{priceLabel(event.price, t)}</p>
      <TmaTicketButton url={ticket} label={t("tma.buyTickets")} />
      <div className={styles.actions}>
        <a className="btn btn--secondary btn--small" href={localePath(lang, `/e/${event.id}/ics`)}>
          {t("event.calendar")}
        </a>
        <ShareButton title={event.title} text={event.title} url={`${SITE_URL}${localePath(lang, `/e/${event.id}`)}`} />
        <Link className="btn btn--ghost btn--small" href={`${ctx.hrefs.guide()}?event=${event.id}`}>
          {t("tma.askGuide")}
        </Link>
      </div>
      {event.occurrences.length ? <Sessions event={event} lang={lang} t={t} today={ctx.today} /> : null}
      {event.description_html ? (
        <section aria-labelledby="tma-desc">
          <h2 id="tma-desc">{t("event.description")}</h2>
          <Collapsible lines={6}>
            <div
              lang={contentLang}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: описание очищено на стороне API (sanitize-html)
              dangerouslySetInnerHTML={{ __html: event.description_html }}
            />
          </Collapsible>
        </section>
      ) : null}
      <Passport event={event} lang={lang} t={t} today={ctx.today} />
      <ReportButton eventId={event.id} occurrenceId={next?.id} />
    </article>
  );
}
