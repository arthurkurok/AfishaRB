"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n-client";
import styles from "./offline.module.css";

/** Состояние «офлайн»: баннер при потере сети и короткое сообщение о восстановлении. */
export function OfflineBanner() {
  const { t } = useI18n();
  const [state, setState] = useState<"online" | "offline" | "restored">("online");

  useEffect(() => {
    if (!navigator.onLine) setState("offline");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = () => setState("offline");
    const on = () => {
      setState("restored");
      timer = setTimeout(() => setState("online"), 4000);
    };
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className={styles.wrap}>
      {state === "offline" ? (
        <div className={styles.banner} data-testid="offline-banner">
          <span>{t("state.offline")}</span>
        </div>
      ) : state === "restored" ? (
        <div className={`${styles.banner} ${styles.ok}`}>{t("state.online")}</div>
      ) : null}
    </div>
  );
}
