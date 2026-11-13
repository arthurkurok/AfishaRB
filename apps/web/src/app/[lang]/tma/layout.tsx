import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import { LogoMark } from "@/brand/logo";
import { TmaProvider } from "@/components/tma/tma-provider";
import { localePath } from "@/lib/hrefs";
import { createT, resolveLang } from "@/lib/i18n";
import styles from "./tma.module.css";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Telegram Mini App: те же экраны в компактном виде, без шапки и подвала сайта. */
export default async function TmaLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  const other = lang === "ru" ? "ba" : "ru";
  return (
    <TmaProvider rootPath={localePath(lang, "/tma")}>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <div className={styles.shell}>
        <header className={styles.bar}>
          <Link href={localePath(lang, "/tma")} className={styles.brand}>
            <LogoMark size={28} />
            <span>{t("meta.brand")}</span>
          </Link>
          <nav aria-label={t("nav.main")} className={styles.nav}>
            <Link href={localePath(lang, "/tma/search")}>{t("nav.search")}</Link>
            <Link href={localePath(lang, "/tma/guide")}>{t("nav.guide")}</Link>
            <a href={localePath(other, "/tma")} hrefLang={other} lang={other} className={styles.lang}>
              {other === "ba" ? "Баш" : "Рус"}
            </a>
          </nav>
        </header>
        <main id="main" className={styles.main}>
          {children}
        </main>
      </div>
    </TmaProvider>
  );
}
