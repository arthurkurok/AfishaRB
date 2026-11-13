/**
 * API ответил 401: токен отозван или сменился. Сбрасываем сессию (cookie меняется только здесь и в Server Actions)
 * и ведём на вход с возвратом на ту же страницу.
 */
import { type NextRequest, NextResponse } from "next/server";
import { isSafeNext, loginHref, ORG_COOKIE, SESSION_COOKIE } from "@/lib/session";

export function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? undefined;
  const res = NextResponse.redirect(
    new URL(loginHref(next && isSafeNext(next) ? next : undefined, "expired"), request.url),
  );
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(ORG_COOKIE);
  return res;
}
