import type { NextConfig } from "next";

/** Хосты изображений, которые оптимизирует next/image; остальные выводятся как есть (см. components/poster). */
export const IMAGE_HOSTS = ["cdn.culture.ru"];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@afisha/i18n", "@afisha/design-tokens"],
  images: {
    remotePatterns: IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // Сайт нельзя встраивать в чужие фреймы (кликджекинг)…
        source: "/:path((?!embed|tma|ba/embed|ba/tma).*)",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      // …кроме iframe-фоллбэка виджета: его встраивают сайты министерства и учреждений.
      ...["/embed", "/ba/embed"].map((source) => ({
        source,
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors *" }],
      })),
      // Mini App в Telegram Web открывается во фрейме web.telegram.org.
      ...["/tma", "/tma/:path*", "/ba/tma", "/ba/tma/:path*"].map((source) => ({
        source,
        headers: [
          ...securityHeaders,
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      })),
      {
        source: "/widget/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default config;
