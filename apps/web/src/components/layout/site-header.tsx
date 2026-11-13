import type { Lang, Translate } from "@afisha/i18n";
import Link from "next/link";
import { LogoMark } from "@/brand/logo";
import { localePath } from "@/lib/hrefs";
import styles from "./header.module.css";
import { HeaderControls } from "./header-controls";
import { MobileMenu, type NavItem } from "./mobile-menu";

export function navItems(lang: Lang, t: Translate): NavItem[] {
  return [
    { href: localePath(lang, "/search"), label: t("nav.search") },
    { href: localePath(lang, "/guide"), label: t("nav.guide") },
    { href: localePath(lang, "/m"), label: t("nav.districts") },
    { href: localePath(lang, "/developers"), label: t("nav.developers") },
    { href: localePath(lang, "/about"), label: t("nav.about") },
  ];
}

export function SiteHeader({ lang, t }: { lang: Lang; t: Translate }) {
  const items = navItems(lang, t);
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href={localePath(lang, "/")} className={styles.brand}>
          <LogoMark size={36} />
          <span className={styles.brandText}>
            <span className={styles.brandName}>{t("meta.brand")}</span>
            <span className={styles.brandTag}>{t("footer.tagline")}</span>
          </span>
        </Link>
        <nav aria-label={t("nav.main")} className={styles.nav}>
          <ul>
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.navLink}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.controls}>
          <HeaderControls />
          <MobileMenu items={items} />
        </div>
      </div>
    </header>
  );
}
