"use client";
/**
 * Выбор города (правка владельца 14.11.2026): чип в герое + диалог при первом заходе.
 * Город пишется и в localStorage (afisha.city — его читает Гид), и в куку afisha_city
 * (её читают серверные компоненты — главная фильтрует ленты по городу).
 * «Вся республика» = без фильтра; диалог больше не показываем (afisha.cityAsked).
 */
import type { Municipality } from "@afisha/contract";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { localePath } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import { readPref, setCityCookie, writePref } from "@/lib/prefs";
import styles from "./city-gate.module.css";

export function CityGate({ municipalities, currentName }: { municipalities: Municipality[]; currentName?: string }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string | null | undefined>(undefined); // undefined = не читали

  useEffect(() => {
    const stored = readPref("afisha.city");
    setSelected(stored);
    // Первый заход: город ещё не выбирали и окно не открывали — предлагаем выбор сразу
    if (!stored && !readPref("afisha.cityAsked")) dialog.current?.showModal();
  }, []);

  const top = [...municipalities].sort((a, b) => (b.upcoming ?? 0) - (a.upcoming ?? 0)).slice(0, 12);

  const choose = (id: string | null) => {
    writePref("afisha.city", id);
    writePref("afisha.cityAsked", "1");
    setCityCookie(id);
    setSelected(id);
    dialog.current?.close();
    // Город выбран — ведём на его афишу, чтобы не листать всю республику сразу
    if (id) router.push(localePath(lang, `/m/${id}`));
    else router.refresh();
  };

  return (
    <>
      <button
        type="button"
        className={`chip chip-button ${styles.chip}`}
        aria-label={currentName ? t("home.cityChipChange") : undefined}
        onClick={() => dialog.current?.showModal()}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          />
          <circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth={2} />
        </svg>
        <span>{currentName ?? t("home.cityChipSelect")}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </svg>
      </button>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="city-gate-title"
        onClose={(e) => {
          // закрыли без выбора (Esc / крестик) — считаем спрос учтённым, чтобы не мучить окном
          if (selected === null || selected === undefined) writePref("afisha.cityAsked", "1");
          void e;
        }}
      >
        <div className={styles.body}>
          <h2 id="city-gate-title">{t("home.cityModalTitle")}</h2>
          <p className="muted">{t("home.cityModalLead")}</p>
          <ul className={styles.cities}>
            {top.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={`chip chip-button ${m.id === selected ? styles.active : ""}`}
                  onClick={() => choose(m.id)}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <button type="button" className="btn btn--secondary" onClick={() => choose(null)}>
              {t("home.cityModalWhole")}
            </button>
            <a className={styles.all} href={localePath(lang, "/m")}>
              {t("home.allPlaces")} →
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
