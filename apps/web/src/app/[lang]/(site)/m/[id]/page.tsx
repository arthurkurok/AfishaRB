import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventCard } from "@/components/event/event-card";
import { Collection } from "@/components/home/collection";
import { GuideBar } from "@/components/home/guide-bar";
import { WhenTabs } from "@/components/home/when-tabs";
import { MuniMap } from "@/components/municipality/muni-map";
import { StateMessage } from "@/components/states/states";
import { getMunicipalities, safe, searchOccurrences } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { API_BASE } from "@/lib/config";
import { formatRub } from "@/lib/format";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import type { When } from "@/lib/search-params";
import styles from "../m.module.css";

export const revalidate = 300;

type Props = { params: Promise<{ lang: string; id: string }> };

export function generateStaticParams() {
  return [];
}

async function findMunicipality(lang: "ru" | "ba", id: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(id)) notFound();
  const list = await getMunicipalities(lang);
  const m = list.find((x) => x.id === id);
  if (!m) notFound();
  return { m, list };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const lang = await resolveLang(params);
  const t = createT(lang);
  const { m } = await findMunicipality(lang, id);
  return {
    title: t("municipality.title", { name: m.name }),
    description: t("municipality.lead", { name: m.name }),
    alternates: { canonical: localePath(lang, `/m/${m.id}`), languages: { ru: `/m/${m.id}`, ba: `/ba/m/${m.id}` } },
  };
}

export default async function MunicipalityPage({ params }: Props) {
  const { id } = await params;
  const lang = await resolveLang(params);
  const t = createT(lang);
  const { m, list } = await findMunicipality(lang, id);
  const ctx = cardContext(lang, t);
  const base = { lang, municipality: m.id, limit: "8" };
  const variants: Record<string, string>[] = [
    { when: "today" },
    { when: "tomorrow" },
    { when: "weekend" },
    { when: "month", free: "true", limit: "10" },
    { when: "month", categories: "kids", limit: "10" },
  ];
  const [today, tomorrow, weekend, free, kids] = await Promise.all(
    variants.map((p) => safe(searchOccurrences(new URLSearchParams({ ...base, ...p })))),
  );
  const panels = (
    [
      ["today", t("when.today"), today],
      ["tomorrow", t("when.tomorrow"), tomorrow],
      ["weekend", t("when.weekend"), weekend],
    ] as const
  ).map(([w, label, res]) => ({
    id: w,
    label,
    content: res?.items.length ? (
      <>
        <ul className="card-grid">
          {res.items.map((item, i) => (
            <li key={item.id}>
              <EventCard item={item} ctx={ctx} priority={w === "today" && i < 2} />
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 24 }}>
          <Link className="btn btn--secondary" href={ctx.hrefs.search({ when: w as When, municipality: [m.id] })}>
            {t("home.seeAllWhen", { period: label })} · {t("common.events", { count: res.total })}
          </Link>
        </p>
      </>
    ) : (
      <StateMessage title={t("state.emptyTitle")} text={t("state.emptyText")} headingLevel={3} />
    ),
  }));
  const others = list.filter((x) => x.id !== m.id && (x.upcoming ?? 0) > 0).slice(0, 12);

  return (
    <div className={`container ${styles.page}`}>
      <nav aria-label={t("nav.breadcrumbs")} className="caption">
        <Link href={localePath(lang, "/")}>{t("nav.home")}</Link> ›{" "}
        <Link href={localePath(lang, "/m")}>{t("nav.districts")}</Link>
      </nav>
      <div className={styles.hero}>
        <div className="stack">
          <h1 className="display">{t("municipality.title", { name: m.name })}</h1>
          {lang === "ba" && m.name_ru !== m.name ? (
            <p className="muted" lang="ru">
              {m.name_ru}
            </p>
          ) : m.name_ba && m.name_ba !== m.name ? (
            <p className="muted" lang="ba">
              {m.name_ba}
            </p>
          ) : null}
          <p className={styles.lead}>{t("municipality.lead", { name: m.name })}</p>
          <p className="caption">
            {m.upcoming ? t("municipality.upcoming", { count: m.upcoming }) : t("municipality.noUpcoming")}
          </p>
          <p>
            <Link className="btn btn--primary" href={ctx.hrefs.search({ municipality: [m.id] })}>
              {t("municipality.seeAll", { name: m.name })}
            </Link>{" "}
            <a className="btn btn--ghost" href={`${API_BASE}/feeds/ical?municipality=${m.id}`}>
              {t("search.subscribeIcal")}
            </a>
          </p>
        </div>
        <div className={styles.map}>
          <MuniMap municipalities={list} hrefFor={(x) => localePath(lang, `/m/${x}`)} highlight={m.id} labelTop={4} />
        </div>
      </div>

      <GuideBar t={t} hrefs={ctx.hrefs} compact />

      <section className="section" aria-labelledby="m-when">
        <h2 id="m-when" style={{ marginBottom: 16 }}>
          {t("home.whenTitle")}
        </h2>
        <WhenTabs panels={panels} label={t("home.whenLabel")} />
      </section>

      <Collection
        id="m-free"
        title={t("home.freeTitle")}
        lead={t("home.freeLead")}
        href={ctx.hrefs.search({ free: true, municipality: [m.id] })}
        items={free?.items ?? []}
        ctx={ctx}
        accent="var(--color-meadow)"
      />
      <Collection
        id="m-kids"
        title={t("home.kidsTitle")}
        lead={t("home.kidsLead")}
        href={ctx.hrefs.search({ categories: ["kids"], municipality: [m.id] })}
        items={kids?.items ?? []}
        ctx={ctx}
        accent="var(--color-category-kids)"
      />

      <section aria-labelledby="m-others" className={styles.places}>
        <h2 id="m-others" style={{ marginBottom: 12 }}>
          {t("municipality.otherPlaces")}
        </h2>
        <ul className="chips">
          {others.map((o) => (
            <li key={o.id}>
              <Link
                href={localePath(lang, `/m/${o.id}`)}
                className="chip chip-button"
                style={{ textDecoration: "none" }}
              >
                {o.name} <span className="muted">· {formatRub(o.upcoming ?? 0)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
