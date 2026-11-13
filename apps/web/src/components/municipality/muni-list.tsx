"use client";
/** Список городов и районов с фильтром по названию (ru и ba: «Өфө» найдёт Уфу). */
import type { Municipality } from "@afisha/contract";
import Link from "next/link";
import { useId, useState } from "react";
import { formatRub } from "@/lib/format";
import { localePath } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import styles from "./muni-list.module.css";

export function MuniList({ municipalities }: { municipalities: Municipality[] }) {
  const { lang, t } = useI18n();
  const [q, setQ] = useState("");
  const id = useId();
  const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");
  const query = norm(q.trim());
  const match = (m: Municipality) =>
    !query || [m.name, m.name_ru, m.name_ba ?? ""].some((n) => norm(n).includes(query));
  const groups = [
    { title: t("municipality.cities"), items: municipalities.filter((m) => m.kind === "city" && match(m)) },
    { title: t("municipality.districts"), items: municipalities.filter((m) => m.kind === "district" && match(m)) },
  ];
  const found = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className={styles.wrap}>
      <div className="field">
        <label htmlFor={id}>{t("municipality.filterLabel")}</label>
        <input
          id={id}
          type="search"
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </div>
      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title} aria-label={g.title}>
            <h2 className={styles.title}>{g.title}</h2>
            <ul className={styles.list}>
              {[...g.items]
                .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                .map((m) => (
                  <li key={m.id}>
                    <Link href={localePath(lang, `/m/${m.id}`)} className={styles.item}>
                      <span>{m.name}</span>
                      <span className={styles.count}>
                        {m.upcoming ? formatRub(m.upcoming) : t("municipality.noUpcoming")}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ) : null,
      )}
      {found === 0 ? <p className="muted">{t("municipality.notFoundTitle")}</p> : null}
    </div>
  );
}
