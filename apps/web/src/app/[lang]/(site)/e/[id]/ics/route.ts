/** «В календарь»: .ics со всеми актуальными сеансами события (или одним — ?occurrence=<id>). */
import { isLang } from "@afisha/i18n";
import { ApiError, getEvent } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { localePath } from "@/lib/hrefs";
import { eventToIcs } from "@/lib/ics";

export async function GET(request: Request, { params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params;
  if (!isLang(lang) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  try {
    const event = await getEvent(id, lang, { revalidate: 300 });
    const occurrence = new URL(request.url).searchParams.get("occurrence") ?? undefined;
    const body = eventToIcs(event, `${SITE_URL}${localePath(lang, `/e/${id}`)}`, { occurrenceId: occurrence });
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="afisha-${id}.ics"`,
        "cache-control": "public, max-age=300",
      },
    });
  } catch (err) {
    const status = err instanceof ApiError && err.status === 404 ? 404 : 502;
    return new Response(status === 404 ? "Not found" : "Upstream error", { status });
  }
}
