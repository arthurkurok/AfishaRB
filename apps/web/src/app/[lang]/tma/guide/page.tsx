import { GuideChat } from "@/components/guide/guide-chat";
import { getMunicipalities, safe } from "@/lib/api";
import { createT, resolveLang } from "@/lib/i18n";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TmaGuide({ params, searchParams }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 1000) : undefined;
  const event = typeof sp.event === "string" && /^[0-9a-f-]{36}$/i.test(sp.event) ? sp.event : undefined;
  const municipalities = await safe(getMunicipalities(lang));
  return (
    <>
      <h1>{t("guide.title")}</h1>
      <GuideChat initialQuery={q} eventId={event} municipalities={municipalities ?? []} surface="tma" />
    </>
  );
}
