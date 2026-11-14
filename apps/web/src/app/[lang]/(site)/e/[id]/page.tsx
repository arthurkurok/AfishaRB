import type { EventDetail, OccurrenceCard } from "@afisha/contract";
import { formatDateTime, todayIn } from "@afisha/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/brand/category-icon";
import { AskAboutEvent } from "@/components/event/ask-about-event";
import { Collapsible, ReportButton, ShareButton } from "@/components/event/event-actions";
import { CONTENT_LANG, EventCard } from "@/components/event/event-card";
import { Passport } from "@/components/event/passport";
import { Poster } from "@/components/event/poster";
import { Sessions } from "@/components/event/sessions";
import { StatusBadge } from "@/components/event/status-badge";
import { ApiError, getEvent, safe, searchOccurrences } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { REGION_TZ, SITE_URL } from "@/lib/config";
import { dateBadge, decodeEntities, isInactive, priceLabel, routeLinks, statusKind, statusLabel } from "@/lib/format";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import { eventJsonLd, serializeJsonLd } from "@/lib/jsonld";
import styles from "./event.module.css";

export const revalidate = 300;

type Props = { params: Promise<{ lang: string; id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Страницы событий строятся по запросу и кэшируются (ISR), заранее — ни одной. */
export function generateStaticParams() {
  return [];
}

async function load(lang: "ru" | "ba", id: string): Promise<EventDetail> {
  if (!UUID_RE.test(id)) notFound();
  try {
    return await getEvent(id, lang);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
}

/** Ближайший актуальный сеанс: первый не прошедший и не отменённый, иначе первый. */
function nextOccurrence(event: EventDetail) {
  return event.occurrences.find((o) => !isInactive(o.status)) ?? event.occurrences[0];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const lang = await resolveLang(params);
  const event = await load(lang, id);
  const next = nextOccurrence(event);
  const when = next ? formatDateTime(next.starts_at, lang, todayIn(REGION_TZ), REGION_TZ) : "";
  const description = [when, next?.venue?.name, `${event.age_rating}+`, event.summary].filter(Boolean).join(" · ");
  const path = `/e/${event.id}`;
  return {
    title: event.title,
    description: description.slice(0, 300),
    alternates: { canonical: localePath(lang, path), languages: { ru: path, ba: `/ba${path}` } },
    openGraph: {
      type: "article",
      title: event.title,
      description: description.slice(0, 300),
      url: localePath(lang, path),
    },
    twitter: { card: "summary_large_image", title: event.title, description: description.slice(0, 200) },
    // Прошедшие и отменённые события остаются доступны по ссылке (SEO), но не продвигаются.
    robots: next && isInactive(next.status) ? { index: true, follow: true } : undefined,
  };
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const lang = await resolveLang(params);
  const t = createT(lang);
  const event = await load(lang, id);
  const ctx = cardContext(lang, t);
  const today = ctx.today;
  const next = nextOccurrence(event);
  const category = event.categories[0] ?? "education";
  const kind = next ? statusKind(next) : null;
  const status = next ? statusLabel(next, t, lang, REGION_TZ) : null;
  const badge = next ? dateBadge(next, lang, REGION_TZ, today) : null;
  const ticketUrl = next?.ticket_url ?? event.ticket_url;
  const canBuy = ticketUrl && next && !["cancelled", "ended", "sold_out", "postponed"].includes(next.status);
  const pageUrl = `${SITE_URL}${localePath(lang, `/e/${event.id}`)}`;
  const route = next?.venue ? routeLinks(next.venue.geo, next.venue.address) : null;
  const contentLang = lang === CONTENT_LANG ? undefined : CONTENT_LANG;
  const allCancelled = event.occurrences.length > 0 && event.occurrences.every((o) => o.status === "cancelled");
  const allEnded = event.occurrences.length > 0 && event.occurrences.every((o) => o.status === "ended");

  const similarRes = await safe(
    searchOccurrences(new URLSearchParams({ lang, categories: category, when: "month", limit: "7" }), {
      revalidate: 900,
    }),
  );
  const similar: OccurrenceCard[] = (similarRes?.items ?? []).filter((o) => o.event.id !== event.id).slice(0, 4);

  return (
    <article className={styles.page} style={{ ["--cat" as string]: `var(--color-category-${category})` }}>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD сериализуется с экранированием «<»
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventJsonLd(event, pageUrl)) }}
      />
      <div className="container">
        <nav aria-label={t("nav.breadcrumbs")} className={styles.crumbs}>
          <ol>
            <li>
              <Link href={localePath(lang, "/")}>{t("nav.home")}</Link>
            </li>
            <li>
              <Link href={ctx.hrefs.search()}>{t("nav.search")}</Link>
            </li>
            <li>
              <Link href={ctx.hrefs.search({ categories: [category] })}>{t(`categories.${category}`)}</Link>
            </li>
          </ol>
        </nav>

        <header className={styles.hero}>
          <div className={styles.media}>
            <Poster
              image={event.image}
              category={category}
              alt={t("card.coverAlt", { title: event.title })}
              artTitle={t("card.illustrationAlt", { category: t(`categories.${category}`) })}
              sizes="(min-width: 960px) 50vw, 100vw"
              priority
              dim={allCancelled || allEnded}
            />
          </div>
          <div className={styles.info}>
            <ul className={`chips ${styles.badges}`}>
              {event.categories.map((c) => (
                <li
                  key={c}
                  className={`chip ${styles.cat}`}
                  style={{ ["--cat" as string]: `var(--color-category-${c})` }}
                >
                  <CategoryIcon code={c} size={16} />
                  {t(`categories.${c}`)}
                </li>
              ))}
              <li className={`chip chip--age ${styles.age}`} title={t("common.ageLong", { age: event.age_rating })}>
                <span aria-hidden="true">{t("common.age", { age: event.age_rating })}</span>
                <span className="sr-only">{t("common.ageLong", { age: event.age_rating })}</span>
              </li>
              {event.pushkin_card ? <li className={`chip ${styles.pushkin}`}>{t("common.pushkin")}</li> : null}
            </ul>
            {kind && status ? <StatusBadge kind={kind} label={status} size="l" /> : null}
            <h1 className={styles.title} lang={contentLang}>
              {event.title}
            </h1>
            {next && badge ? (
              <div className={styles.when}>
                <p className={styles.whenText}>{badge.label}</p>
                <div>
                  {next.venue ? (
                    <p className="muted">
                      <Link
                        href={localePath(lang, `/v/${next.venue.id}`)}
                        lang={contentLang}
                        className={styles.venueLink}
                      >
                        {decodeEntities(next.venue.name)}
                      </Link>
                      {next.venue.municipality_id ? (
                        <>
                          {" · "}
                          <Link
                            href={localePath(lang, `/m/${next.venue.municipality_id}`)}
                            className={styles.venueLink}
                          >
                            {next.venue.municipality}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                  {event.occurrences.length > 1 ? (
                    <a href="#sessions" className={styles.moreDates}>
                      {t("card.moreDates", { count: event.occurrences.length - 1 })}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
            <p className={styles.price}>
              <span className="sr-only">{t("event.price")}: </span>
              {priceLabel(event.price, t)}
            </p>
            <div className={styles.actions}>
              {canBuy ? (
                <a href={ticketUrl} className="btn btn--primary" target="_blank" rel="noopener noreferrer">
                  {t("event.tickets")}
                  <span className="sr-only"> {t("common.newTab")}</span>
                </a>
              ) : event.price.is_free ? (
                <p className={styles.freeEntry}>{t("event.freeEntry")}</p>
              ) : !allCancelled && !allEnded ? (
                <p className={styles.freeEntry}>{t("event.noTickets")}</p>
              ) : null}
              {!allEnded ? (
                <a
                  href={localePath(lang, `/e/${event.id}/ics`)}
                  className="btn btn--secondary"
                  download={`afisha-${event.id}.ics`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      d="M4 6h16v14H4zM4 10h16M8 3v5M16 3v5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  </svg>
                  {t("event.calendar")}
                </a>
              ) : null}
              <ShareButton
                title={event.title}
                text={t("event.shareText", { title: event.title, date: badge?.label ?? "" })}
                url={pageUrl}
              />
            </div>
            <div className={styles.secondary}>
              <Link href={`${ctx.hrefs.guide()}?event=${event.id}`} className="btn btn--ghost">
                {t("event.askGuide")}
              </Link>
              <ReportButton eventId={event.id} occurrenceId={next?.id} />
            </div>
            {event.image?.author ? (
              <p className="caption">
                {t("event.coverCredit", { author: decodeEntities(event.image.author) })}
                {event.image.license ? ` · ${event.image.license}` : ""}
              </p>
            ) : null}
          </div>
        </header>

        {allCancelled ? (
          <p className={`notice ${styles.cancelled}`} role="note">
            {t("event.cancelledNotice")}
          </p>
        ) : allEnded ? (
          <p className="notice" role="note">
            {t("event.endedNotice")}
          </p>
        ) : null}

        <div className={styles.body}>
          <div className={styles.main}>
            {event.occurrences.length ? <Sessions event={event} lang={lang} t={t} today={today} /> : null}

            {event.description_html ? (
              <section aria-labelledby="desc-title" className={styles.section}>
                <h2 id="desc-title">{t("event.description")}</h2>
                <Collapsible>
                  <div
                    className={styles.description}
                    lang={contentLang}
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: описание очищено на стороне API (sanitize-html, белый список тегов)
                    dangerouslySetInnerHTML={{ __html: event.description_html }}
                  />
                </Collapsible>
              </section>
            ) : null}

            <section aria-labelledby="details-title" className={styles.section}>
              <h2 id="details-title" className="sr-only">
                {t("event.venue")}
              </h2>
              <dl className={styles.details}>
                {next?.venue ? (
                  <div>
                    <dt>{t("event.venue")}</dt>
                    <dd>
                      <p>
                        <Link href={localePath(lang, `/v/${next.venue.id}`)} lang={contentLang}>
                          {decodeEntities(next.venue.name)}
                        </Link>
                      </p>
                      {next.venue.address ? (
                        <p className="muted" lang={contentLang}>
                          {next.venue.address}
                        </p>
                      ) : null}
                      {route ? (
                        <p className={styles.route}>
                          {t("event.route")}:{" "}
                          <a href={route.yandex} target="_blank" rel="noopener noreferrer">
                            {t("event.routeYandex")}
                            <span className="sr-only"> {t("common.newTab")}</span>
                          </a>{" "}
                          ·{" "}
                          <a href={route.twogis} target="_blank" rel="noopener noreferrer">
                            {t("event.route2gis")}
                            <span className="sr-only"> {t("common.newTab")}</span>
                          </a>
                        </p>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {event.organization ? (
                  <div>
                    <dt>{t("event.organizer")}</dt>
                    <dd lang={contentLang}>{decodeEntities(event.organization)}</dd>
                  </div>
                ) : null}
                {event.languages.length ? (
                  <div>
                    <dt>{t("event.languages")}</dt>
                    <dd>
                      {event.languages
                        .map((l) => (["ru", "ba", "tt", "en"].includes(l) ? t(`event.languageNames.${l as "ru"}`) : l))
                        .join(", ")}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t("event.age")}</dt>
                  <dd>{t("common.ageLong", { age: event.age_rating })}</dd>
                </div>
                {event.accessibility && Object.keys(event.accessibility).length && event.accessibility.accessible ? (
                  <div>
                    <dt>{t("event.accessibility")}</dt>
                    <dd className={styles.access}>
                      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <circle cx="12" cy="4.5" r="2" fill="currentColor" />
                        <path
                          d="M6 8.5h12M12 8.5v6l-3 6M12 14.5l3 6"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      </svg>
                      {t("event.accessibleYes")}
                    </dd>
                  </div>
                ) : null}
                {event.is_permanent ? (
                  <div>
                    <dt>{t("event.category")}</dt>
                    <dd>{t("event.permanent")}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          </div>

          <aside className={styles.aside}>
            <Passport event={event} lang={lang} t={t} today={today} />
            <AskAboutEvent eventId={event.id} />
          </aside>
        </div>

        {similar.length ? (
          <section aria-labelledby="similar-title" className="section">
            <h2 id="similar-title" className={styles.similarTitle}>
              {t("event.similar")}
            </h2>
            <ul className="card-grid">
              {similar.map((o) => (
                <li key={o.id}>
                  <EventCard item={o} ctx={ctx} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
