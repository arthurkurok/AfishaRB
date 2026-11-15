"use client";
/**
 * «🔔 Подписаться на этот фильтр» на странице поиска (ТЗ: разделы 3, 6.2): подписка на город и/или категории
 * по X-Device-Id — только идентификатор устройства и фильтры, без персональных данных. После подписки
 * кнопка становится тумблером: повторное нажатие отписывает (подписка удаляется на сервере целиком).
 */
import type { CategoryCode, Subscription, SubscriptionPeriod } from "@afisha/contract";
import { useEffect, useState } from "react";
import { createSubscription, deleteSubscription, listSubscriptions } from "@/lib/api";
import { useI18n } from "@/lib/i18n-client";
import { deviceId } from "@/lib/prefs";
import styles from "./subscribe-button.module.css";

/** Та же подписка уже есть в списке устройства? (сравнение по фильтрам, не по названию) */
const isSame = (
  s: Subscription,
  municipality: string | null,
  categories: CategoryCode[],
  period: SubscriptionPeriod | null,
) =>
  (s.municipality ?? null) === municipality &&
  [...s.categories].sort().join(",") === [...categories].sort().join(",") &&
  (s.period ?? null) === period;

export function SubscribeButton({
  municipality,
  categories,
  period,
}: {
  municipality: string | null;
  categories: CategoryCode[];
  period: SubscriptionPeriod | null;
}) {
  const { t: tr } = useI18n();
  // Строки — из packages/i18n (ru и ba), как во всём интерфейсе
  const t = {
    subscribe: tr("search.subscribeFilter"),
    subscribed: tr("search.subscribedFilter"),
    busy: "…",
    error: tr("search.subscribeError"),
    hint: tr("search.subscribeHint"),
  };
  const [state, setState] = useState<"checking" | "idle" | "busy" | "subscribed" | "error">("checking");
  const [subId, setSubId] = useState<string | null>(null);
  const catKey = [...categories].sort().join(",");

  // при смене фильтров ищем уже существующую подписку этого устройства
  // biome-ignore lint/correctness/useExhaustiveDependencies: массив categories сравниваем стабильно — через catKey
  useEffect(() => {
    let alive = true;
    setState("checking");
    listSubscriptions(deviceId())
      .then((items) => {
        if (!alive) return;
        const found = items.find((s) => isSame(s, municipality, categories, period));
        setSubId(found?.id ?? null);
        setState(found ? "subscribed" : "idle");
      })
      .catch(() => {
        if (alive) setState("idle");
      });
    return () => {
      alive = false;
    };
  }, [municipality, catKey, period]);

  const toggle = async () => {
    if (state !== "idle" && state !== "subscribed") return;
    setState("busy");
    const device = deviceId();
    try {
      if (state === "subscribed" && subId) {
        await deleteSubscription(device, subId);
        setSubId(null);
        setState("idle");
      } else {
        const created = await createSubscription(device, {
          municipality: municipality ?? undefined,
          categories: categories.length ? categories : undefined,
          period,
        });
        setSubId(created.id);
        setState("subscribed");
      }
    } catch {
      setState("error");
    }
  };

  const subscribed = state === "subscribed";
  return (
    <div className={styles.box}>
      <button
        type="button"
        className={`btn ${subscribed ? "btn--secondary" : "btn--ghost"} btn--small ${styles.button}`}
        aria-pressed={subscribed}
        title={t.hint}
        onClick={() => void toggle()}
        disabled={state === "busy" || state === "checking"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 0 1-3.4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {state === "busy" ? t.busy : subscribed ? t.subscribed : t.subscribe}
      </button>
      {state === "error" ? (
        <p role="alert" className={`caption ${styles.error}`}>
          {t.error}
        </p>
      ) : null}
    </div>
  );
}
