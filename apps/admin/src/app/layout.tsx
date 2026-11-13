import "@afisha/design-tokens/tokens.css";
import "./globals.css";
import { colors } from "@afisha/design-tokens";
import type { Metadata, Viewport } from "next";
import { Commissioner, Golos_Text } from "next/font/google";
import type { ReactNode } from "react";

// Оба шрифта содержат полную башкирскую кириллицу (07-design §5): названия учреждений и событий бывают на ba.
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

export const metadata: Metadata = {
  title: { default: "Тамаша · Рабочее место", template: "%s · Тамаша · Рабочее место" },
  description:
    "Кабинет учреждения, модерация и «Пульс культуры» — рабочее место сотрудников афиши культуры Башкортостана",
  applicationName: "Тамаша · Рабочее место",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: colors["color-bg"].light },
    { media: "(prefers-color-scheme: dark)", color: colors["color-bg"].dark },
  ],
};

/** Тема применяется до первой отрисовки, чтобы не мигало (выбор хранится только в браузере сотрудника). */
const BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("afisha.admin.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} ${commissioner.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: статический скрипт без пользовательских данных */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
