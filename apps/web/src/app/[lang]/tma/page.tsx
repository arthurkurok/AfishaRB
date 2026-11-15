import Link from "next/link";
import { EventCard } from "@/components/event/event-card";
import { CategoryScroller } from "@/components/home/category-scroller";
import { GuideBar } from "@/components/home/guide-bar";
import { WhenTabs } from "@/components/home/when-tabs";
import { FeedError, StateMessage } from "@/components/states/states";
import { getCategories, safe, searchOccurrences } from "@/lib/api";
import { cardContext } from "@/lib/card-context";
import { createT, resolveLang } from "@/lib/i18n";
import type { When } from "@/lib/search-params";

export const revalidate = 300;

/** Главный экран Mini App: Гид, «Сегодня / Завтра / Выходные», зонтик категорий. */
export default async function TmaHome({ params }: { params: Promise<{ lang: string }> }) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const ctx = cardContext(lang, t, "tma");
  const base = { lang, limit: "6" };
  const [categories, today, tomorrow, weekend] = await Promise.all([
    safe(getCategories(lang)),
    ...(["today", "tomorrow", "weekend"] as const).map((when) =>
      safe(searchOccurrences(new URLSearchParams({ ...base, when }))),
    ),
  ]);
  const panels = (
    [
      ["today", t("when.today"), today],
      ["tomorrow", t("when.tomorrow"), tomorrow],
      ["weekend", t("when.weekend"), weekend],
    ] as const
  ).map(([id, label, res]) => ({
    id,
    label,
    content: !res ? (
      <FeedError t={t} />
    ) : "items" in res && res.items.length ? (
      <>
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {res.items.map((item) => (
            <li key={item.id}>
              <EventCard item={item} ctx={ctx} variant="compact" />
            </li>
          ))}
        </ul>
        <p style={{ marginTop: "var(--space-4)" }}>
          <Link href={ctx.hrefs.search({ when: id as When })} className="btn btn--secondary btn--block">
            {t("home.seeAllWhen", { period: label })}
          </Link>
        </p>
      </>
    ) : (
      <StateMessage title={t("state.emptyTitle")} text={t("state.emptyText")} headingLevel={3} />
    ),
  }));
  return (
    <>
      <h1 className="sr-only">{t("meta.title")}</h1>
      <GuideBar t={t} hrefs={ctx.hrefs} compact />
      <section aria-labelledby="tma-when">
        <h2 id="tma-when" className="sr-only">
          {t("home.whenTitle")}
        </h2>
        <WhenTabs panels={panels} label={t("home.whenLabel")} />
      </section>
      {categories && Array.isArray(categories) ? (
        <CategoryScroller categories={categories} t={t} hrefs={ctx.hrefs} />
      ) : null}
    </>
  );
}
