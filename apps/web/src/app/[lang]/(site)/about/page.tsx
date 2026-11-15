import type { Metadata } from "next";
import Link from "next/link";
import { TranslationForm } from "@/components/developers/translation-form";
import { CONTACT_EMAIL, OPERATOR_NAME } from "@/lib/config";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "../prose.module.css";

type Props = { params: Promise<{ lang: string }> };

const SLOT = "\u0000";

/** Вставляет ссылку на место плейсхолдера в переведённой фразе (порядок слов в ru и ba разный). */
function WithLink({ text, href, label }: { text: string; href: string; label: string }) {
  const [before, after] = text.split(SLOT);
  return (
    <>
      {before}
      <a href={href}>{label}</a>
      {after}
    </>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return {
    title: t("about.title"),
    description: t("about.lead"),
    alternates: { canonical: localePath(lang, "/about"), languages: { ru: "/about", ba: "/ba/about" } },
  };
}

export default async function AboutPage({ params }: Props) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const toc = [
    ["reliability", t("about.reliabilityTitle")],
    ["recommendations", t("about.recommendTitle")],
    ["sources", t("about.sourcesTitle")],
    ["privacy", t("about.privacyTitle")],
    ["translation", t("about.translationTitle")],
    ["contacts", t("about.contactsTitle")],
  ];
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>{t("about.title")}</h1>
        <p className={styles.lead}>{t("about.lead")}</p>
        <p className="muted" data-testid="disclaimer">
          {t("footer.disclaimer")}
        </p>
        {lang === "ba" ? (
          <p className="notice">
            {t("about.translationText")} <a href="#translation">{t("about.translationAction")}</a>
          </p>
        ) : null}
        <nav aria-label={t("about.toc")}>
          <ul className={styles.toc}>
            {toc.map(([id, label]) => (
              <li key={id}>
                <a className="chip chip-button" href={`#${id}`}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section id="reliability" aria-labelledby="reliability-title" className={styles.section}>
        <h2 id="reliability-title">{t("about.reliabilityTitle")}</h2>
        <p>{t("about.reliability1")}</p>
        <p>{t("about.reliability2")}</p>
        <p>{t("about.reliability3")}</p>
      </section>

      <section id="recommendations" aria-labelledby="rec-title" className={`${styles.section} ${styles.card}`}>
        <h2 id="rec-title">{t("about.recommendTitle")}</h2>
        <p>{t("about.recommendIntro")}</p>
        {lang === "ba" ? (
          <p className="caption">
            {t("about.recommendLawNote")}{" "}
            <Link href="/about#recommendations" hrefLang="ru">
              {t("about.recommendRuLink")}
            </Link>
          </p>
        ) : null}
        <p>{t("about.recommendWhere")}</p>
        <h3>{t("about.recommendMethods")}</h3>
        <p>{t("about.recommendMethodsText")}</p>
        <h3>{t("about.recommendData")}</h3>
        <p>{t("about.recommendDataText")}</p>
        <h3>{t("about.recommendSources")}</h3>
        <p>{t("about.recommendSourcesText")}</p>
        <h3>{t("about.recommendControl")}</h3>
        <p>{t("about.recommendControlText")}</p>
        <p>
          <strong>{t("about.recommendOwner", { owner: OPERATOR_NAME })}</strong>
          <br />
          <WithLink
            text={t("about.recommendEmail", { email: SLOT })}
            href={`mailto:${CONTACT_EMAIL}`}
            label={CONTACT_EMAIL}
          />
        </p>
      </section>

      <section id="sources" aria-labelledby="sources-title" className={styles.section}>
        <h2 id="sources-title">{t("about.sourcesTitle")}</h2>
        <p>{t("about.sourcesText")}</p>
      </section>

      <section id="privacy" aria-labelledby="privacy-title" className={styles.section}>
        <h2 id="privacy-title">{t("about.privacyTitle")}</h2>
        <p className="notice">{t("about.privacyDraft")}</p>
        <p>{t("about.privacyText")}</p>
      </section>

      <section id="translation" aria-labelledby="translation-title" className={`${styles.section} ${styles.card}`}>
        <h2 id="translation-title">{t("about.translationTitle")}</h2>
        <p>{t("about.translationText")}</p>
        <h3>{t("about.translationFormTitle")}</h3>
        <TranslationForm email={CONTACT_EMAIL} />
      </section>

      <section id="contacts" aria-labelledby="contacts-title" className={styles.section}>
        <h2 id="contacts-title">{t("about.contactsTitle")}</h2>
        <p>
          <WithLink
            text={t("about.contactsText", { email: SLOT })}
            href={`mailto:${CONTACT_EMAIL}`}
            label={CONTACT_EMAIL}
          />
        </p>
      </section>
    </div>
  );
}
