import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MuniList } from "@/components/municipality/muni-list";
import { MuniMap } from "@/components/municipality/muni-map";
import { RetryButton } from "@/components/states/retry-button";
import { StateMessage } from "@/components/states/states";
import { getMunicipalities, safe } from "@/lib/api";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "./m.module.css";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return {
    title: t("municipality.allTitle"),
    description: t("municipality.allLead"),
    alternates: { canonical: localePath(lang, "/m"), languages: { ru: "/m", ba: "/ba/m" } },
  };
}

export default async function MunicipalitiesPage({ params, searchParams }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const sp = await searchParams;
  // Выбор города без JavaScript: форма на главной отправляет ?id=<slug>.
  if (typeof sp.id === "string" && /^[a-z0-9-]{2,80}$/.test(sp.id)) redirect(localePath(lang, `/m/${sp.id}`));
  const municipalities = await safe(getMunicipalities(lang));
  return (
    <div className={`container ${styles.page}`}>
      <h1>{t("municipality.allTitle")}</h1>
      <p className="muted">{t("municipality.allLead")}</p>
      {municipalities ? (
        <div className={styles.grid}>
          <section aria-labelledby="map-title" className={styles.map}>
            <h2 id="map-title">{t("municipality.mapTitle")}</h2>
            <p className="caption">{t("municipality.mapNote")}</p>
            <MuniMap municipalities={municipalities} hrefBase={localePath(lang, "/m/")} labelTop={10} />
          </section>
          <MuniList municipalities={municipalities} />
        </div>
      ) : (
        <StateMessage
          title={t("state.errorTitle")}
          text={t("state.errorText")}
          emotion="network-error"
          role="alert"
          action={<RetryButton />}
        />
      )}
    </div>
  );
}
