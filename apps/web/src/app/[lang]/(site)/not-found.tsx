import { translator } from "@afisha/i18n";
import Link from "next/link";
import { StateMessage } from "@/components/states/states";
import { getMessages } from "@/lib/i18n";

/** 404 внутри сайта. Язык неизвестен (not-found не получает params) — показываем русскую версию со ссылкой на ba. */
export default function NotFound() {
  const t = translator("ru", getMessages("ru"));
  return (
    <div className="container section">
      <StateMessage
        title={t("state.notFoundTitle")}
        text={t("state.notFoundText")}
        emotion="not-found"
        headingLevel={1}
        action={
          <>
            <Link href="/" className="btn btn--primary">
              {t("state.toHome")}
            </Link>
            <Link href="/guide" className="btn btn--secondary">
              {t("tma.askGuide")}
            </Link>
          </>
        }
      />
    </div>
  );
}
