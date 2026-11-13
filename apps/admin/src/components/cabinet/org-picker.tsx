/**
 * Выбор учреждения: поиск по названию (GET-форма — работает и без JavaScript) и список с числом сеансов.
 */
import type { OrganizationRef } from "@afisha/contract";
import { Icon } from "@/components/ui/icons";
import { chooseOrganization } from "@/lib/actions/cabinet";
import styles from "./org-picker.module.css";

export function OrgPicker({ q, items, current }: { q: string; items: OrganizationRef[]; current?: string }) {
  return (
    <section className="card stack" aria-labelledby="org-title">
      <div className="stack" style={{ gap: "var(--space-1)" }}>
        <h2 id="org-title">Выберите учреждение</h2>
        <p className="caption">Показаны учреждения с ближайшими событиями в афише.</p>
      </div>
      <form method="get" action="/cabinet" className={styles.search} aria-label="Поиск учреждения">
        <input type="hidden" name="change" value="1" />
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="org-q">Название учреждения</label>
          <input
            id="org-q"
            name="oq"
            type="search"
            className="input"
            defaultValue={q}
            placeholder="Например: театр кукол"
          />
        </div>
        <button type="submit" className="btn btn--primary">
          <Icon name="search" size={18} />
          Найти
        </button>
      </form>
      {items.length === 0 ? (
        <p className="muted" role="status">
          Ничего не нашли{q ? ` по запросу «${q}»` : ""}. Попробуйте часть названия: «музей», «ДК», «библиотека».
        </p>
      ) : (
        <ul className={styles.list} aria-label="Учреждения">
          {items.map((o) => (
            <li key={o.id} data-current={o.id === current ? "true" : undefined}>
              <div className={styles.info}>
                <strong>{o.name}</strong>
                <span className="caption">
                  {o.municipality ?? "Муниципалитет не указан"} · сеансов впереди: {o.upcoming}
                </span>
              </div>
              <form action={chooseOrganization}>
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="name" value={o.name} />
                <button
                  type="submit"
                  className="btn btn--secondary btn--small"
                  aria-label={`Открыть кабинет: ${o.name}`}
                >
                  {o.id === current ? "Текущее" : "Открыть кабинет"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
