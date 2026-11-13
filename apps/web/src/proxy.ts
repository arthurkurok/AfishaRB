/**
 * Языковая маршрутизация: русская версия живёт в корне (/search), башкирская — под /ba (/ba/search).
 * Внутри приложения все страницы лежат в app/[lang]; здесь адреса без префикса переписываются на /ru/…
 * Для iframe-виджета язык можно передать параметром: /embed?lang=ba.
 */
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (/^\/(ru|ba)(\/|$)/.test(pathname)) return NextResponse.next();
  const lang =
    (pathname === "/embed" || pathname.startsWith("/tma")) && searchParams.get("lang") === "ba" ? "ba" : "ru";
  const url = request.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    "/((?!_next/|api/|widget/|favicon\\.ico|icon|apple-icon|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|webp|avif|ico|js|css|map|txt|xml|woff2?)$).*)",
  ],
};
