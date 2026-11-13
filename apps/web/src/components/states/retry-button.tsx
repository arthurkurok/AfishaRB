"use client";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n-client";

/** Повторить загрузку данных страницы (серверные компоненты перезапрашиваются). */
export function RetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button type="button" className="btn btn--primary" onClick={() => (onRetry ? onRetry() : router.refresh())}>
      {t("common.retry")}
    </button>
  );
}
