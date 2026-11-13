import "@afisha/design-tokens/tokens.css";
import "../globals.css";
import { colors } from "@afisha/design-tokens";
import { HTML_LANG, LANGS } from "@afisha/i18n";
import type { Metadata, Viewport } from "next";
import { Commissioner, Golos_Text } from "next/font/google";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/config";
import { createT, getMessages, resolveLang } from "@/lib/i18n";
import { I18nProvider } from "@/lib/i18n-client";

// Оба шрифта содержат полную башкирскую кириллицу (Ә Ғ Ҙ Ҡ Ң Ө Ҫ Ү Һ — диапазон cyrillic-ext), 07-design §5.
const golos = Golos_Text({
  subsets: ["cyrillic", "cyrillic-ext", "latin"],
  variable: "--font-golos",
  display: "swap",
});
const commissioner = Commissioner({
  subsets: ["cyrillic", "cyrillic-ext", "latin"],
  axes: ["FLAR"],
  variable: "--font-commissioner",
  display: "swap",
});

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await resolveLang(params);
  const t = createT(lang);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("meta.title"), template: `%s · ${t("meta.brand")}` },
    description: t("meta.description"),
    applicationName: t("meta.brand"),
    openGraph: {
      type: "website",
      siteName: t("meta.title"),
      locale: lang === "ba" ? "ba_RU" : "ru_RU",
      title: t("meta.title"),
      description: t("meta.description"),
    },
    formatDetection: { telephone: false },
    icons: { icon: "/icon.svg" },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colors["color-bg"].light },
    { media: "(prefers-color-scheme: dark)", color: colors["color-bg"].dark },
  ],
};

/** Тема и режим контраста применяются до первой отрисовки, чтобы не мигало (выбор хранится только в браузере). */
const BOOT_SCRIPT = `(function(){try{if(location.pathname.indexOf("/embed")>-1)return;var d=document.documentElement,s=localStorage;var t=s.getItem("afisha.theme");if(t==="light"||t==="dark")d.setAttribute("data-theme",t);if(s.getItem("afisha.contrast")==="high")d.setAttribute("data-contrast","high")}catch(e){}})();`;

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lang = await resolveLang(params);
  return (
    <html lang={HTML_LANG[lang]} className={`${golos.variable} ${commissioner.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: статический скрипт без пользовательских данных */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <I18nProvider lang={lang} messages={getMessages(lang)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
