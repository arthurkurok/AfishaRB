/** «Новое событие» учреждения: ИИ-помощник заполнения → проверка → публикация (03-functional-spec §7). */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewEventWizard } from "@/components/cabinet/new-event-wizard";
import { loadSessions, venuesOf } from "@/lib/cabinet";
import { REGION_TZ, REGION_TZ_LABEL } from "@/lib/config";
import { CATEGORY_CODES, categoryLabel } from "@/lib/labels";
import { isUuid, readChosenOrg, requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Новое событие" };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  await requireSession("/cabinet/new");
  const sp = await searchParams;
  const chosen = await readChosenOrg();
  const orgParam = typeof sp.org === "string" ? sp.org : "";
  const orgId = isUuid(orgParam) ? orgParam : chosen?.id;
  if (!orgId) redirect("/cabinet?change=1");

  // Площадки учреждения — из его сеансов на полгода вперёд.
  const sessions = await loadSessions({ organization: orgId, period: 180 }).catch(() => null);
  const venues = sessions ? venuesOf(sessions.items) : [];
  const orgName = (chosen?.id === orgId ? chosen.name : null) ?? sessions?.items[0]?.event.organization ?? "Учреждение";

  return (
    <>
      <div className="page-head">
        <div>
          <p className="caption">
            <Link href={`/cabinet?org=${orgId}`}>← {orgName}</Link>
          </p>
          <h1>Новое событие</h1>
          <p className="muted">Вставьте анонс — помощник заполнит форму, а вы проверите и опубликуете.</p>
        </div>
      </div>
      <NewEventWizard
        orgId={orgId}
        orgName={orgName}
        venues={venues}
        categories={CATEGORY_CODES.map((code) => ({ code, label: categoryLabel(code) }))}
        tz={REGION_TZ}
        tzLabel={REGION_TZ_LABEL}
      />
    </>
  );
}
