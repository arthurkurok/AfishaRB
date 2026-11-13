import type { Metadata } from "next";
import { Mascot } from "@/brand/mascot";
import { GuideChat } from "@/components/guide/guide-chat";
import { getEvent, getMunicipalities, safe } from "@/lib/api";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "./guide.module.css";

type Props = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return {
    title: t("guide.title"),
    description: t("guide.lead"),
    alternates: { canonical: localePath(lang, "/guide") },
  };
}

export default async function GuidePage({ params, searchParams }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 1000) : undefined;
  const eventParam = typeof sp.event === "string" && /^[0-9a-f-]{36}$/i.test(sp.event) ? sp.event : undefined;
  const [municipalities, event] = await Promise.all([
    safe(getMunicipalities(lang)),
    eventParam ? safe(getEvent(eventParam, lang)) : Promise.resolve(null),
  ]);
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <Mascot emotion="greeting" size={72} />
        <div>
          <h1>{t("guide.title")}</h1>
          <p className="muted">{t("guide.lead")}</p>
          {event ? (
            <p className={`notice ${styles.about}`}>
              {t("event.askGuide")}: <strong lang={lang === "ru" ? undefined : "ru"}>{event.title}</strong>
            </p>
          ) : null}
        </div>
      </header>
      <GuideChat initialQuery={q} eventId={event?.id} municipalities={municipalities ?? []} />
    </div>
  );
}
