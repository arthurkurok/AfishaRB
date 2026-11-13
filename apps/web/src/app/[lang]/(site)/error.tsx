"use client";
import { useEffect } from "react";
import { StateMessage } from "@/components/states/states";
import { useI18n } from "@/lib/i18n-client";

/** Ошибка загрузки данных (API недоступен): маскот «ошибка сети» и повтор. */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container section">
      <StateMessage
        title={t("state.errorTitle")}
        text={t("state.errorText")}
        emotion="network-error"
        role="alert"
        headingLevel={1}
        action={
          <button type="button" className="btn btn--primary" onClick={reset}>
            {t("common.retry")}
          </button>
        }
      />
    </div>
  );
}
