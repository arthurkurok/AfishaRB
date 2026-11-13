import type { OccurrenceCard } from "@afisha/contract";
import { addDays, relativeTime } from "@afisha/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { type CardContext, EventCard } from "@/components/event/event-card";
import { CityPicker } from "@/components/home/city-picker";
import { Collection } from "@/components/home/collection";
import { GuideBar } from "@/components/home/guide-bar";
import { KuraiUmbrella } from "@/components/home/kurai-umbrella";
import { WhenTabs } from "@/components/home/when-tabs";
import { MuniMap } from "@/components/municipality/muni-map";
import { RetryButton } from "@/components/states/retry-button";
import { StateMessage } from "@/components/states/states";
import { getCategories, getMunicipalities, getStats, safe, searchOccurrences } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { formatRub } from "@/lib/format";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import type { When } from "@/lib/search-params";
import styles from "./home.module.css";

export const revalidate = 300;

type Params = { params: Promise<{ lang: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return {
    title: { absolute: t("meta.title") },
    alternates: { canonical: localePath(lang, "/"), languages: { ru: "/", ba: "/ba" } },
  };
}

function q(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

/** «Последний шанс»: длительные события, которые заканчиваются в ближайшие 10 дней (в API нет такого фильтра). */
function lastChance(items: OccurrenceCard[], today: string): OccurrenceCard[] {
  const limit = addDays(today, 10);
  const seen = new Set<string>();
  return items
    .filter((o) => o.is_range && o.ends_at && o.ends_at.slice(0, 10) <= limit && o.ends_at.slice(0, 10) >= today)
    .filter((o) => {
      if (seen.has(o.event.id)) return false;
      seen.add(o.event.id);
      return true;
    })
    .sort((a, b) => (a.ends_at! < b.ends_at! ? -1 : 1))
    .slice(0, 10);
}

function Grid({ items, ctx, eager = false }: { items: OccurrenceCard[]; ctx: CardContext; eager?: boolean }) {
  return (
    <ul className="card-grid">
      {items.map((item, i) => (
        <li key={item.id}>
          <EventCard item={item} ctx={ctx} priority={eager && i < 2} />
        </li>
      ))}
    </ul>
  );
}

export default async function HomePage({ params }: Params) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const ctx = cardContext(lang, t);
  const base = { lang, limit: "8" };
  const [stats, categories, municipalities, today, tomorrow, weekend, free, pushkin, kids, ranges] = await Promise.all([
    safe(getStats()),
    safe(getCategories(lang)),
    safe(getMunicipalities(lang)),
    safe(searchOccurrences(q({ ...base, when: "today" }))),
    safe(searchOccurrences(q({ ...base, when: "tomorrow" }))),
    safe(searchOccurrences(q({ ...base, when: "weekend" }))),
    safe(searchOccurrences(q({ ...base, free: "true", when: "week", limit: "10" }))),
    safe(searchOccurrences(q({ ...base, pushkin: "true", when: "month", limit: "10" }))),
    safe(searchOccurrences(q({ ...base, categories: "kids", age: "6", when: "week", limit: "10" }))),
    safe(searchOccurrences(q({ lang, when: "today", sort: "date", limit: "100" }))),
  ]);

  const failed = !today && !tomorrow && !weekend && !categories;
  const whenPanels = (
    [
      ["today", t("when.today"), today],
      ["tomorrow", t("when.tomorrow"), tomorrow],
      ["weekend", t("when.weekend"), weekend],
    ] as const
  ).map(([id, label, res]) => ({
    id,
    label,
    content: res?.items.length ? (
      <>
        <Grid items={res.items} ctx={ctx} eager={id === "today"} />
        <p className={styles.more}>
          <Link href={ctx.hrefs.search({ when: id as When })} className="btn btn--secondary">
            {t("home.seeAllWhen", { period: label })} · {t("common.events", { count: res.total })}
          </Link>
        </p>
      </>
    ) : (
      <StateMessage title={t("state.emptyTitle")} text={t("state.emptyText")} emotion="not-found" headingLevel={3} />
    ),
  }));

  const topCities = (municipalities ?? []).filter((m) => (m.upcoming ?? 0) > 0).slice(0, 8);

  return (
    <div className={styles.page}>
      <section className={`container ${styles.hero}`} aria-labelledby="home-title">
        <div className={styles.heroText}>
          <h1 id="home-title" className="display">
            {t("home.title")}
          </h1>
          <p className={styles.lead}>{t("home.lead")}</p>
          {stats ? (
            <p className="caption">
              {t("home.statsLine", {
                events: formatRub(stats.events),
                venues: formatRub(stats.venues),
                places: stats.municipalities_with_events,
              })}
              {stats.updated_at ? ` · ${t("home.updated", { ago: relativeTime(stats.updated_at, lang) })}` : null}
            </p>
          ) : null}
        </div>
        <GuideBar t={t} hrefs={ctx.hrefs} />
      </section>

      {failed ? (
        <div className="container section">
          <StateMessage
            title={t("state.errorTitle")}
            text={t("state.errorText")}
            emotion="network-error"
            role="alert"
            action={<RetryButton />}
          />
        </div>
      ) : (
        <>
          <section className="container section" aria-labelledby="when-title">
            <h2 id="when-title" className={styles.sectionTitle}>
              {t("home.whenTitle")}
            </h2>
            <WhenTabs panels={whenPanels} label={t("home.whenLabel")} />
          </section>

          {categories?.length ? (
            <div className={`container section ${styles.umbrella}`}>
              <KuraiUmbrella categories={categories} t={t} hrefs={ctx.hrefs} />
            </div>
          ) : null}

          <div className="container">
            <h2 className="sr-only">{t("home.collectionsTitle")}</h2>
            <Collection
              id="free"
              title={t("home.freeTitle")}
              lead={t("home.freeLead")}
              href={ctx.hrefs.search({ free: true, when: "week" })}
              items={free?.items ?? []}
              ctx={ctx}
              accent="var(--color-meadow)"
            />
            <Collection
              id="pushkin"
              title={t("home.pushkinTitle")}
              lead={t("home.pushkinLead")}
              href={ctx.hrefs.search({ pushkin: true, when: "month" })}
              items={pushkin?.items ?? []}
              ctx={ctx}
              accent="var(--color-focus)"
            />
            <Collection
              id="kids"
              title={t("home.kidsTitle")}
              lead={t("home.kidsLead")}
              href={ctx.hrefs.search({ categories: ["kids"], age: 6, when: "week" })}
              items={kids?.items ?? []}
              ctx={ctx}
              accent="var(--color-category-kids)"
            />
            <Collection
              id="last"
              title={t("home.lastChanceTitle")}
              lead={t("home.lastChanceLead")}
              href={ctx.hrefs.search({ when: "week" })}
              items={lastChance(ranges?.items ?? [], ctx.today)}
              ctx={ctx}
              accent="var(--color-honey)"
            />
          </div>

          {municipalities?.length ? (
            <section className={`container section ${styles.city}`} aria-labelledby="city-title">
              <div className={styles.cityText}>
                <h2 id="city-title">{t("home.cityTitle")}</h2>
                <CityPicker municipalities={municipalities} />
                <ul className="chips" aria-label={t("municipality.cities")}>
                  {topCities.map((m) => (
                    <li key={m.id}>
                      <Link href={ctx.hrefs.municipality(m.id)} className={`chip ${styles.cityChip}`}>
                        {m.name}
                        <span className="muted">· {formatRub(m.upcoming ?? 0)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={localePath(lang, "/m")} className="btn btn--ghost">
                  {t("home.allPlaces")} →
                </Link>
              </div>
              <Link href={localePath(lang, "/m")} className={styles.mapLink} aria-hidden="true" tabIndex={-1}>
                <MuniMap
                  municipalities={municipalities}
                  hrefFor={ctx.hrefs.municipality}
                  labelTop={6}
                  interactive={false}
                />
              </Link>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
