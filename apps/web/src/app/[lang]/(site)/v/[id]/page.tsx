import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTENT_LANG, EventCard } from "@/components/event/event-card";
import { StateMessage } from "@/components/states/states";
import { ApiError, getVenue } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { API_BASE } from "@/lib/config";
import { decodeEntities, routeLinks } from "@/lib/format";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "./venue.module.css";

export const revalidate = 300;

type Props = { params: Promise<{ lang: string; id: string }> };

export function generateStaticParams() {
  return [];
}

async function load(lang: "ru" | "ba", id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  try {
    return await getVenue(id, lang);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const lang = await resolveLang(params);
  const t = createT(lang);
  const v = await load(lang, id);
  return {
    title: decodeEntities(v.name),
    description: [t("venue.title"), v.address, v.municipality].filter(Boolean).join(" · "),
    alternates: { canonical: localePath(lang, `/v/${v.id}`), languages: { ru: `/v/${v.id}`, ba: `/ba/v/${v.id}` } },
  };
}

/** Страница площадки (03-functional-spec §2): адрес, маршрут, доступность, ближайшие события, iCal-подписка. */
export default async function VenuePage({ params }: Props) {
  const { id } = await params;
  const lang = await resolveLang(params);
  const t = createT(lang);
  const v = await load(lang, id);
  const ctx = cardContext(lang, t);
  const route = routeLinks(v.geo, v.address);
  const contentLang = lang === CONTENT_LANG ? undefined : CONTENT_LANG;
  const accessible = Boolean(v.accessibility && (v.accessibility as Record<string, unknown>).accessible);
  return (
    <div className={`container ${styles.page}`}>
      <nav aria-label={t("nav.breadcrumbs")} className="caption">
        <Link href={localePath(lang, "/")}>{t("nav.home")}</Link>
        {v.municipality_id ? (
          <>
            {" › "}
            <Link href={localePath(lang, `/m/${v.municipality_id}`)}>{v.municipality}</Link>
          </>
        ) : null}
      </nav>
      <header className={styles.head}>
        <p className="caption">{t("venue.title")}</p>
        <h1 lang={contentLang}>{decodeEntities(v.name)}</h1>
        <dl className={styles.facts}>
          {v.address ? (
            <div>
              <dt>{t("event.address")}</dt>
              <dd lang={contentLang}>{v.address}</dd>
            </div>
          ) : null}
          {v.organization ? (
            <div>
              <dt>{t("venue.organization")}</dt>
              <dd lang={contentLang}>{decodeEntities(v.organization)}</dd>
            </div>
          ) : null}
          {accessible ? (
            <div>
              <dt>{t("event.accessibility")}</dt>
              <dd>{t("event.accessibleYes")}</dd>
            </div>
          ) : null}
        </dl>
        <p className={styles.actions}>
          <a className="btn btn--secondary" href={route.yandex} target="_blank" rel="noopener noreferrer">
            {t("event.route")}: {t("event.routeYandex")}
            <span className="sr-only"> {t("common.newTab")}</span>
          </a>
          <a className="btn btn--secondary" href={route.twogis} target="_blank" rel="noopener noreferrer">
            {t("event.route")}: {t("event.route2gis")}
            <span className="sr-only"> {t("common.newTab")}</span>
          </a>
          <a className="btn btn--ghost" href={`${API_BASE}/feeds/ical?venue=${v.id}`}>
            {t("venue.subscribe")}
          </a>
        </p>
      </header>
      <section aria-labelledby="venue-upcoming">
        <h2 id="venue-upcoming" className={styles.sub}>
          {t("venue.upcoming")}
          {v.upcoming_total ? (
            <span className="caption"> · {t("venue.upcomingTotal", { count: v.upcoming_total })}</span>
          ) : null}
        </h2>
        {v.upcoming.length ? (
          <ul className="card-grid">
            {v.upcoming.map((o, i) => (
              <li key={o.id}>
                <EventCard item={o} ctx={ctx} priority={i < 2} />
              </li>
            ))}
          </ul>
        ) : (
          <StateMessage title={t("state.emptyTitle")} text={t("venue.empty")} headingLevel={3} />
        )}
      </section>
    </div>
  );
}
