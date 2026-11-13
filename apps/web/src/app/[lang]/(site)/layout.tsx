import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { createT, resolveLang } from "@/lib/i18n";

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return (
    <>
      <a href="#main" className="skip-link">
        {t("nav.skip")}
      </a>
      <SiteHeader lang={lang} t={t} />
      <main id="main" tabIndex={-1} className="site-main">
        {children}
      </main>
      <SiteFooter lang={lang} t={t} />
      <OfflineBanner />
    </>
  );
}
