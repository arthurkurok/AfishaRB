import type { Metadata } from "next";
import { SearchView } from "@/components/search/search-view";
import { getCategories, getMunicipalities, safe, searchOccurrences } from "@/lib/api";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import { activeKeys, filtersToApiQuery, filtersToParams, parseFilters } from "@/lib/search-params";
import styles from "./search.module.css";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const filters = parseFilters(await searchParams);
  const qs = filtersToParams(filters).toString();
  return {
    title: t("search.title"),
    alternates: { canonical: localePath(lang, `/search${qs ? `?${qs}` : ""}`) },
    // Комбинации из многих фильтров и текстовые запросы не индексируем — это бесконечное пространство URL.
    robots: { index: activeKeys(filters).length <= 2 && !filters.q, follow: true },
  };
}

export default async function SearchPage({ params, searchParams }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const filters = parseFilters(await searchParams);
  const [result, municipalities, categories] = await Promise.all([
    safe(searchOccurrences(filtersToApiQuery(filters, { lang, limit: 24 }), { revalidate: 60 })),
    safe(getMunicipalities(lang)),
    safe(getCategories(lang)),
  ]);
  const place =
    filters.municipality.length === 1 ? municipalities?.find((m) => m.id === filters.municipality[0])?.name : null;
  const heading = place ? t("search.titleWith", { place }) : t("search.title");
  return (
    <div className="container">
      <h1 className={styles.title}>{heading}</h1>
      <SearchView
        initial={result}
        filters={filters}
        municipalities={municipalities ?? []}
        categories={categories ?? []}
        heading={heading}
      />
    </div>
  );
}
