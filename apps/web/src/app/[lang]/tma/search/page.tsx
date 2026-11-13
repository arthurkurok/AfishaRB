import { SearchView } from "@/components/search/search-view";
import { getCategories, getMunicipalities, safe, searchOccurrences } from "@/lib/api";
import { createT, resolveLang } from "@/lib/i18n";
import { filtersToApiQuery, parseFilters } from "@/lib/search-params";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TmaSearch({ params, searchParams }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const filters = parseFilters(await searchParams);
  const [result, municipalities, categories] = await Promise.all([
    safe(searchOccurrences(filtersToApiQuery(filters, { lang, limit: 20 }), { revalidate: 60 })),
    safe(getMunicipalities(lang)),
    safe(getCategories(lang)),
  ]);
  return (
    <>
      <h1 className="sr-only">{t("search.title")}</h1>
      <SearchView
        initial={result}
        filters={filters}
        municipalities={municipalities ?? []}
        categories={categories ?? []}
        surface="tma"
        heading={t("search.title")}
      />
    </>
  );
}
