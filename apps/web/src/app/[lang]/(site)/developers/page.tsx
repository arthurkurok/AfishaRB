import type { Metadata } from "next";
import { CodeBlock } from "@/components/developers/code-block";
import { WidgetBuilder } from "@/components/developers/widget-builder";
import { getCategories, getMunicipalities, safe } from "@/lib/api";
import { API_BASE, WIDGET_SRC } from "@/lib/config";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "../prose.module.css";

type Props = { params: Promise<{ lang: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return {
    title: t("developers.title"),
    description: t("developers.lead"),
    alternates: { canonical: localePath(lang, "/developers"), languages: { ru: "/developers", ba: "/ba/developers" } },
  };
}

export default async function DevelopersPage({ params }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const [municipalities, categories] = await Promise.all([safe(getMunicipalities(lang)), safe(getCategories(lang))]);
  const curl = `curl "${API_BASE}/v1/occurrences?when=weekend&municipality=ufa&categories=theatre&age=6&lang=${lang}&limit=5"`;
  const js = `const params = new URLSearchParams({ when: "weekend", municipality: "ufa", free: "true", limit: "10" });
const res = await fetch(\`${API_BASE}/v1/occurrences?\${params}\`);
const { items, next_cursor } = await res.json();
for (const o of items) {
  console.log(o.starts_at, o.event.title, \`\${o.event.age_rating}+\`, o.venue?.name, o.status);
}`;
  const php = `<?php
// Афиша Уфы на выходные — например, для компонента 1С-Битрикс
$url = '${API_BASE}/v1/occurrences?' . http_build_query([
    'when' => 'weekend', 'municipality' => 'ufa', 'limit' => 10, 'lang' => '${lang}',
]);
$data = json_decode(file_get_contents($url), true);
foreach ($data['items'] as $o) {
    printf("%s — %s (%d+)\\n", $o['starts_at'], htmlspecialchars($o['event']['title']), $o['event']['age_rating']);
}`;
  const bitrixPhp = `<?php
// В шаблоне компонента или в header.php шаблона сайта
$APPLICATION->AddHeadString('<script src="${WIDGET_SRC}" type="module" async></script>', true);
?>
<afisha-rb municipality="ufa" layout="list" limit="6" lang="ru" theme="auto"></afisha-rb>`;
  const steps = t("developers.bitrixSteps").split("\n");
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>{t("developers.title")}</h1>
        <p className={styles.lead}>{t("developers.lead")}</p>
        <nav aria-label={t("about.toc")}>
          <ul className="chips">
            {[
              ["quick", t("developers.quickStart")],
              ["feeds", t("developers.feeds")],
              ["widget", t("developers.widget")],
              ["bitrix", t("developers.bitrix")],
              ["limits", t("developers.limits")],
            ].map(([id, label]) => (
              <li key={id}>
                <a className="chip chip-button" href={`#${id}`}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section id="quick" aria-labelledby="quick-title" className={styles.section}>
        <h2 id="quick-title">{t("developers.quickStart")}</h2>
        <p>{t("developers.quickStartLead")}</p>
        <p className={styles.links}>
          <a className="btn btn--primary" href={`${API_BASE}/docs`}>
            {t("developers.docsLink")}
          </a>
          <a className="btn btn--secondary" href={`${API_BASE}/openapi.json`}>
            {t("developers.openapiLink")}
          </a>
        </p>
        <h3>{t("developers.endpoints")}</h3>
        <ul className="rhombus-list">
          <li>
            <code>GET /v1/occurrences</code> — {t("developers.endpointSearch")}
          </li>
          <li>
            <code>GET /v1/events/{"{id}"}</code> — {t("developers.endpointEvent")}
          </li>
          <li>
            <code>GET /v1/categories</code>, <code>GET /v1/municipalities</code> — {t("developers.endpointDicts")}
          </li>
        </ul>
        <div className={styles.codes}>
          <CodeBlock label={t("developers.examplesCurl")} code={curl} language="bash" />
          <CodeBlock label={t("developers.examplesJs")} code={js} language="js" />
          <CodeBlock label={t("developers.examplesPhp")} code={php} language="php" />
        </div>
      </section>

      <section id="feeds" aria-labelledby="feeds-title" className={styles.section}>
        <h2 id="feeds-title">{t("developers.feeds")}</h2>
        <p>{t("developers.feedsLead")}</p>
        <ul className="rhombus-list">
          <li>
            {t("developers.feedIcal")}:{" "}
            <a
              href={`${API_BASE}/feeds/ical?municipality=ufa&categories=theatre`}
            >{`${API_BASE}/feeds/ical?municipality=ufa&categories=theatre`}</a>
          </li>
          <li>
            {t("developers.feedRss")}:{" "}
            <a
              href={`${API_BASE}/feeds/rss?municipality=sterlitamak`}
            >{`${API_BASE}/feeds/rss?municipality=sterlitamak`}</a>
          </li>
        </ul>
      </section>

      <section id="widget" aria-labelledby="widget-title" className={styles.section}>
        <h2 id="widget-title">{t("developers.widget")}</h2>
        <p>{t("developers.widgetLead")}</p>
        <h3>{t("developers.builder")}</h3>
        <p className="muted">{t("developers.builderLead")}</p>
        <WidgetBuilder municipalities={municipalities ?? []} categories={categories ?? []} />
        <h3>{t("developers.snippetIframe")}</h3>
        <p className="muted">{t("developers.snippetIframeLead")}</p>
      </section>

      <section id="bitrix" aria-labelledby="bitrix-title" className={styles.section}>
        <h2 id="bitrix-title">{t("developers.bitrix")}</h2>
        <ol className={styles.steps}>
          {steps.map((s) => (
            <li key={s}>{s.replace(/^\d+\.\s*/, "")}</li>
          ))}
        </ol>
        <CodeBlock label={t("developers.bitrixPhp")} code={bitrixPhp} language="php" />
        <h3>{t("developers.otherCms")}</h3>
        <p>{t("developers.otherCmsText")}</p>
      </section>

      <section id="limits" aria-labelledby="limits-title" className={styles.section}>
        <h2 id="limits-title">{t("developers.limits")}</h2>
        <p>{t("developers.limitsText")}</p>
      </section>
    </div>
  );
}
