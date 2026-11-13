/**
 * Оптимистичная проверка входа (docs Next.js: Authentication → Proxy): без cookie сессии — сразу на /login.
 * Полная проверка (расшифровка, срок, ответ API) — в серверном коде страниц и действий (src/lib/session.ts).
 */
import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "afisha_admin_session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|session/|_next/|icon\\.svg|favicon\\.ico|robots\\.txt).*)"],
};
