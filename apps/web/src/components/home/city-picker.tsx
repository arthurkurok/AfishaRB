"use client";
/**
 * Выбор города или района. Без JavaScript работает как GET-форма на /m (страница перенаправит на /m/<id>).
 * Выбор запоминается в браузере и подставляется Гиду как город по умолчанию.
 */
import type { Municipality } from "@afisha/contract";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { localePath } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import { readPref, setCityCookie, writePref } from "@/lib/prefs";
import styles from "./city-picker.module.css";

export function CityPicker({ municipalities }: { municipalities: Municipality[] }) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("ufa");

  useEffect(() => {
    const stored = readPref("afisha.city");
    if (stored && municipalities.some((m) => m.id === stored)) setValue(stored);
  }, [municipalities]);

  const cities = municipalities.filter((m) => m.kind === "city");
  const districts = municipalities.filter((m) => m.kind === "district");
  const byName = (a: Municipality, b: Municipality) => a.name.localeCompare(b.name, "ru");

  return (
    <form
      className={styles.form}
      action={localePath(lang, "/m")}
      method="get"
      onSubmit={(e) => {
        e.preventDefault();
        writePref("afisha.city", value);
        setCityCookie(value); // чтобы главная тоже фильтровала ленты по этому городу
        router.push(localePath(lang, `/m/${value}`));
      }}
    >
      <label htmlFor={id} className="field-label">
        {t("home.cityLabel")}
      </label>
      <div className={styles.row}>
        <select id={id} name="id" className="select" value={value} onChange={(e) => setValue(e.target.value)}>
          <optgroup label={t("municipality.cities")}>
            {[...cities].sort(byName).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
          <optgroup label={t("municipality.districts")}>
            {[...districts].sort(byName).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </optgroup>
        </select>
        <button type="submit" className="btn btn--secondary">
          {t("home.cityChoose")}
        </button>
      </div>
    </form>
  );
}
