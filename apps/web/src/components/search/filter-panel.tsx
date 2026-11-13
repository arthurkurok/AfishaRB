"use client";
/**
 * Панель фильтров поиска (03-functional-spec §1.2). Нативные поля внутри fieldset/legend —
 * клавиатура и скринридеры работают без доработок; без JavaScript форма отправляется GET-запросом.
 */
import type { Category, Municipality } from "@afisha/contract";
import type { Translate } from "@afisha/i18n";
import { CategoryIcon } from "@/brand/category-icon";
import {
  CATEGORY_CODES,
  CHILD_AGES,
  type Filters,
  PRICE_STEPS,
  RADIUS_STEPS,
  TIME_OF_DAY,
  WHEN_VALUES,
} from "@/lib/search-params";
import styles from "./filter-panel.module.css";

export const FORM_ID = "search-form";

/** Собирает Filters из полей формы (включая поля вне формы с атрибутом form=). */
export function formToParams(form: HTMLFormElement): URLSearchParams {
  const data = new FormData(form);
  const p = new URLSearchParams();
  const q = String(data.get("q") ?? "").trim();
  if (q) p.set("q", q);
  const when = String(data.get("when") ?? "");
  if (when === "range") {
    const from = String(data.get("date_from") ?? "");
    const to = String(data.get("date_to") ?? "");
    if (from) p.set("date_from", from);
    if (to) p.set("date_to", to || from);
  } else if (when) p.set("when", when);
  const tod = data.getAll("time_of_day").map(String);
  if (tod.length) p.set("time_of_day", tod.join(","));
  const near = String(data.get("near") ?? "");
  if (near) {
    p.set("near", near);
    p.set("radius_km", String(data.get("radius_km") ?? "10"));
  } else {
    const muni = String(data.get("municipality") ?? "");
    if (muni) p.set("municipality", muni);
  }
  const cats = data.getAll("categories").map(String);
  if (cats.length) p.set("categories", cats.join(","));
  const price = String(data.get("price") ?? "");
  if (price === "free") p.set("free", "true");
  else if (price === "custom") {
    const v = String(data.get("price_custom") ?? "");
    if (v) p.set("price_max", v);
  } else if (price) p.set("price_max", price);
  const age = String(data.get("age") ?? "");
  if (age) p.set("age", age);
  if (data.get("pushkin")) p.set("pushkin", "true");
  if (data.get("accessible")) p.set("accessible", "true");
  if (data.get("hide_sold_out")) p.set("hide_sold_out", "true");
  const tags = String(data.get("tags") ?? "");
  if (tags) p.set("tags", tags);
  const sort = String(data.get("sort") ?? "");
  if (sort) p.set("sort", sort);
  return p;
}

function priceValue(f: Filters): string {
  if (f.free) return "free";
  if (f.price_max === null) return "";
  return (PRICE_STEPS as readonly number[]).includes(f.price_max) ? String(f.price_max) : "custom";
}

export function FilterPanel({
  filters,
  municipalities,
  categories,
  t,
  onNearMe,
  geoError,
}: {
  filters: Filters;
  municipalities: Municipality[];
  categories: Category[];
  t: Translate;
  onNearMe: () => void;
  geoError: boolean;
}) {
  const range = Boolean(filters.date_from || filters.date_to);
  const whenValue = range ? "range" : (filters.when ?? "");
  const price = priceValue(filters);
  const catTitle = new Map(categories.map((c) => [c.code, c.title]));
  const cities = municipalities.filter((m) => m.kind === "city");
  const districts = municipalities.filter((m) => m.kind === "district");
  const sortByName = (a: Municipality, b: Municipality) => a.name.localeCompare(b.name, "ru");

  return (
    <div className={styles.panel}>
      <fieldset className={styles.group}>
        <legend>{t("when.label")}</legend>
        <div className={styles.options}>
          {[...WHEN_VALUES, "" as const].map((w) => (
            <label key={w || "any"} className={styles.option}>
              <input type="radio" name="when" value={w} defaultChecked={whenValue === w} />
              <span>{w ? t(`when.${w}`) : t("when.any")}</span>
            </label>
          ))}
          <label className={styles.option}>
            <input type="radio" name="when" value="range" defaultChecked={range} />
            <span>{t("when.range")}</span>
          </label>
        </div>
        <div className={styles.dates}>
          <div className="field">
            <label htmlFor="f-date-from">{t("search.dateFrom")}</label>
            <input
              id="f-date-from"
              type="date"
              name="date_from"
              className="input"
              defaultValue={filters.date_from ?? ""}
            />
          </div>
          <div className="field">
            <label htmlFor="f-date-to">{t("search.dateTo")}</label>
            <input id="f-date-to" type="date" name="date_to" className="input" defaultValue={filters.date_to ?? ""} />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t("timeOfDay.label")}</legend>
        <div className={styles.options}>
          {TIME_OF_DAY.map((v) => (
            <label key={v} className={styles.option}>
              <input type="checkbox" name="time_of_day" value={v} defaultChecked={filters.time_of_day.includes(v)} />
              <span>{t(`timeOfDay.${v}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t("search.place")}</legend>
        {filters.near ? (
          <>
            <input type="hidden" name="near" value={filters.near} />
            <p className={styles.nearOn}>{t("search.nearMeOn")}</p>
            <div className="field">
              <label htmlFor="f-radius">{t("search.radius")}</label>
              <select id="f-radius" name="radius_km" className="select" defaultValue={String(filters.radius_km ?? 10)}>
                {RADIUS_STEPS.map((r) => (
                  <option key={r} value={r}>
                    {t("common.km", { distance: r })}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <div className="field">
            <label htmlFor="f-muni" className="sr-only">
              {t("search.place")}
            </label>
            <select id="f-muni" name="municipality" className="select" defaultValue={filters.municipality[0] ?? ""}>
              <option value="">{t("search.allPlaces")}</option>
              <optgroup label={t("municipality.cities")}>
                {[...cities].sort(sortByName).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("municipality.districts")}>
                {[...districts].sort(sortByName).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        )}
        <button
          type="button"
          className={`btn btn--ghost btn--small ${styles.near}`}
          onClick={onNearMe}
          aria-pressed={!!filters.near}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </svg>
          {t("search.nearMe")}
        </button>
        {geoError ? (
          <p role="alert" className={styles.error}>
            {t("search.geoDenied")}
          </p>
        ) : null}
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t("search.price")}</legend>
        <div className={styles.options}>
          <label className={styles.option}>
            <input type="radio" name="price" value="" defaultChecked={price === ""} />
            <span>{t("search.priceAny")}</span>
          </label>
          <label className={styles.option}>
            <input type="radio" name="price" value="free" defaultChecked={price === "free"} />
            <span>{t("common.free")}</span>
          </label>
          {PRICE_STEPS.map((p) => (
            <label key={p} className={styles.option}>
              <input type="radio" name="price" value={p} defaultChecked={price === String(p)} />
              <span>{t("search.priceUpTo", { price: p })}</span>
            </label>
          ))}
          <label className={styles.option}>
            <input type="radio" name="price" value="custom" defaultChecked={price === "custom"} />
            <span>{t("search.priceCustom")}</span>
          </label>
        </div>
        <div className="field">
          <label htmlFor="f-price-custom" className="sr-only">
            {t("search.priceCustom")}
          </label>
          <input
            id="f-price-custom"
            type="number"
            inputMode="numeric"
            min={0}
            step={50}
            name="price_custom"
            className="input"
            placeholder={t("search.priceCustom")}
            defaultValue={price === "custom" ? String(filters.price_max) : ""}
          />
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t("search.age")}</legend>
        <div className="field">
          <label htmlFor="f-age" className="sr-only">
            {t("search.age")}
          </label>
          <select
            id="f-age"
            name="age"
            className="select"
            defaultValue={filters.age === null ? "" : String(filters.age)}
            aria-describedby="f-age-hint"
          >
            <option value="">{t("search.ageAny")}</option>
            {CHILD_AGES.map((a) => (
              <option key={a} value={a}>
                {t("search.ageYears", { age: a })}
              </option>
            ))}
          </select>
          <p id="f-age-hint" className="caption">
            {t("search.ageHint")}
          </p>
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t("search.category")}</legend>
        <div className={styles.options}>
          {CATEGORY_CODES.map((code) => (
            <label
              key={code}
              className={`${styles.option} ${styles.cat}`}
              style={{ ["--cat" as string]: `var(--color-category-${code})` }}
            >
              <input
                type="checkbox"
                name="categories"
                value={code}
                defaultChecked={filters.categories.includes(code)}
              />
              <span>
                <CategoryIcon code={code} size={18} />
                {catTitle.get(code) ?? t(`categories.${code}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>{t("search.extras")}</legend>
        <label className="check">
          <input type="checkbox" name="pushkin" value="true" defaultChecked={filters.pushkin} />
          <span>{t("search.pushkin")}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="accessible" value="true" defaultChecked={filters.accessible} />
          <span>{t("search.accessible")}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="hide_sold_out" value="true" defaultChecked={filters.hide_sold_out} />
          <span>{t("search.hideSoldOut")}</span>
        </label>
        {filters.tags.length ? <input type="hidden" name="tags" value={filters.tags.join(",")} /> : null}
      </fieldset>
    </div>
  );
}
