import type { Lang, Translate } from "@afisha/i18n";
import Link from "next/link";
import { LogoMark } from "@/brand/logo";
import { API_BASE, CONTACT_EMAIL } from "@/lib/config";
import { localePath } from "@/lib/hrefs";
import styles from "./footer.module.css";

export function SiteFooter({ lang, t }: { lang: Lang; t: Translate }) {
  return (
    <footer className={`${styles.footer} no-print`}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.brand}>
          <LogoMark size={40} />
          <div>
            <p className={styles.name}>{t("meta.brand")}</p>
            <p className="caption">{t("footer.tagline")}</p>
          </div>
        </div>
        <ul className={styles.links}>
          <li>
            <Link href={localePath(lang, "/about")}>{t("footer.about")}</Link>
          </li>
          <li>
            <Link href={`${localePath(lang, "/about")}#recommendations`}>{t("footer.rules")}</Link>
          </li>
          <li>
            <Link href={`${localePath(lang, "/about")}#privacy`}>{t("footer.privacy")}</Link>
          </li>
          <li>
            <Link href={localePath(lang, "/developers")}>{t("footer.developers")}</Link>
          </li>
          <li>
            <a href={`mailto:${CONTACT_EMAIL}`}>{t("footer.contacts")}</a>
          </li>
          <li>
            <a href={`${API_BASE}/feeds/rss`}>RSS</a>
          </li>
        </ul>
        <p className={`caption ${styles.sources}`}>{t("footer.sources")}</p>
      </div>
    </footer>
  );
}
