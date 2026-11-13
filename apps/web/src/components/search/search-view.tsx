"use client";
/**
 * Экран поиска: фильтры (панель на десктопе, полноэкранный лист на мобильном), чипы активных фильтров,
 * лента по дням с липкими заголовками, курсорная пагинация. Состояние фильтров — в URL.
 */
import type { Category, Municipality, OccurrenceCard, SearchResult } from "@afisha/contract";
import { dayHeading, formatDate, todayIn } from "@afisha/i18n";
import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { type CardContext, CardSkeleton, EventCard } from "@/components/event/event-card";
import { StateMessage } from "@/components/states/states";
import { useMainButton } from "@/components/tma/tma-provider";
import { apiUrl, searchOccurrences } from "@/lib/api";
import { REGION_TZ } from "@/lib/config";
import { groupByDay, mergePages } from "@/lib/grouping";
import { hrefs, type Surface } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import {
  activeKeys,
  EMPTY_FILTERS,
  effectiveSort,
  type FilterKey,
  type Filters,
  filtersToApiQuery,
  filtersToParams,
  SORT_VALUES,
  withoutKey,
} from "@/lib/search-params";
import { FilterPanel, FORM_ID, formToParams } from "./filter-panel";
import styles from "./search-view.module.css";

const PAGE = 24;

export function SearchView({
  initial,
  filters,
  municipalities,
  categories,
  surface = "site",
  heading,
}: {
  initial: SearchResult | null;
  filters: Filters;
  municipalities: Municipality[];
  categories: Category[];
  surface?: Surface;
  heading: string;
}) {
  const { lang, t } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/search";
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<OccurrenceCard[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initial?.next_cursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [panelVersion, setPanelVersion] = useState(0);
  const [geoError, setGeoError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // В Mini App открытый лист фильтров применяется главной кнопкой Telegram.
  useMainButton(
    surface === "tma" && sheetOpen
      ? { text: t("tma.showResults"), onClick: () => formRef.current?.requestSubmit() }
      : null,
  );
  const variant = surface === "tma" ? "compact" : "default";

  const ctx: CardContext = useMemo(
    () => ({ lang, t, tz: REGION_TZ, today: todayIn(REGION_TZ), hrefs: hrefs(lang, surface) }),
    [lang, t, surface],
  );

  // Новые данные с сервера (смена фильтров) — сбрасываем подгруженные страницы.
  useEffect(() => {
    setItems(initial?.items ?? []);
    setCursor(initial?.next_cursor ?? null);
    setMoreError(false);
  }, [initial]);

  useEffect(() => setEnhanced(true), []);

  const navigate = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  const applyForm = useCallback(() => {
    if (formRef.current) navigate(formToParams(formRef.current));
  }, [navigate]);

  const applyFilters = (next: Filters) => {
    setPanelVersion((v) => v + 1);
    navigate(filtersToParams(next));
  };

  const onFormChange = () => {
    // На мобильном фильтры применяются кнопкой «Показать», на десктопе — сразу (с задержкой на серию нажатий).
    if (sheetOpen) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(applyForm, 350);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    clearTimeout(debounce.current);
    applyForm();
    if (sheetOpen) closeSheet();
  };

  const closeSheet = () => {
    setSheetOpen(false);
    openerRef.current?.focus();
  };

  // Лист фильтров на мобильном: Esc закрывает, фокус уходит внутрь.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeSheet пересоздаётся на каждом рендере, но читает только ref
  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [sheetOpen]);

  const onNearMe = () => {
    if (filters.near) {
      applyFilters({
        ...filters,
        near: null,
        radius_km: null,
        sort: filters.sort === "distance" ? null : filters.sort,
      });
      return;
    }
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoError(false);
        const near = `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`;
        applyFilters({ ...filters, municipality: [], near, radius_km: 10, sort: "distance" });
      },
      () => setGeoError(true),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const res = await searchOccurrences(filtersToApiQuery(filters, { lang, limit: PAGE, cursor }));
      setItems((prev) => mergePages(prev, res.items));
      setCursor(res.next_cursor);
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const sort = effectiveSort(filters);
  const keys = activeKeys(filters);
  const muniName = new Map(municipalities.map((m) => [m.id, m.name]));
  const catName = new Map(categories.map((c) => [c.code, c.title]));

  const chipLabel = (key: FilterKey): string => {
    switch (key) {
      case "q":
        return `«${filters.q}»`;
      case "when":
        return t(`when.${filters.when!}`);
      case "dates":
        return [filters.date_from, filters.date_to]
          .filter(Boolean)
          .map((d) => formatDate(d!, lang))
          .join(" — ");
      case "time_of_day":
        return filters.time_of_day.map((v) => t(`timeOfDay.${v}`)).join(", ");
      case "place":
        return filters.near
          ? `${t("search.nearMe")}, ${t("common.km", { distance: filters.radius_km ?? 10 })}`
          : filters.municipality.map((m) => muniName.get(m) ?? m).join(", ");
      case "categories":
        return filters.categories.map((c) => catName.get(c) ?? t(`categories.${c}`)).join(", ");
      case "tags":
        return filters.tags.map((c) => t(`tags.${c}`)).join(", ");
      case "price":
        return filters.free ? t("common.free") : t("search.priceUpTo", { price: filters.price_max ?? 0 });
      case "age":
        return t("guide.kidAge", { age: filters.age ?? 0 });
      case "pushkin":
        return t("common.pushkin");
      case "accessible":
        return t("search.accessible");
      case "hide_sold_out":
        return t("search.hideSoldOutChip");
    }
  };

  const groups = sort === "date" ? groupByDay(items, REGION_TZ, initial?.applied.date_from) : null;
  const total = initial?.total ?? 0;
  const icalHref = apiUrl("/feeds/ical", filtersToParams(filters));
  const rssHref = apiUrl("/feeds/rss", filtersToParams(filters));

  return (
    <div className={`${styles.layout} ${enhanced ? styles.enhanced : ""}`} data-hydrated={enhanced || undefined}>
      <search className={styles.form}>
        <form
          id={FORM_ID}
          ref={formRef}
          className={styles.form}
          method="get"
          action={pathname}
          onChange={onFormChange}
          onSubmit={onSubmit}
          aria-label={heading}
        >
          <div className={styles.queryBar}>
            <label htmlFor="f-q" className="sr-only">
              {t("search.query")}
            </label>
            <input
              id="f-q"
              name="q"
              type="search"
              className={`input ${styles.query}`}
              placeholder={`${t("search.query")}. ${t("search.queryPlaceholder")}`}
              defaultValue={filters.q}
              key={`q-${panelVersion}`}
              enterKeyHint="search"
              onChange={(e) => e.stopPropagation()}
            />
            <button type="submit" className="btn btn--primary">
              {t("search.show")}
            </button>
            <button
              ref={openerRef}
              type="button"
              className={`btn btn--secondary ${styles.openFilters}`}
              aria-expanded={sheetOpen}
              aria-controls="search-filters"
              onClick={() => setSheetOpen(true)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  d="M4 6h16M7 12h10M10 18h4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </svg>
              {t("search.openFilters")}
              {keys.length ? <span className={styles.badge}>{keys.length}</span> : null}
            </button>
          </div>

          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: на мобильном панель становится модальным диалогом (role задаётся динамически) */}
          <div
            id="search-filters"
            ref={sheetRef}
            className={styles.sheet}
            data-open={sheetOpen || undefined}
            role={sheetOpen ? "dialog" : undefined}
            aria-modal={sheetOpen || undefined}
            aria-label={sheetOpen ? t("search.filters") : undefined}
          >
            <div className={styles.sheetHead}>
              <h2 className={styles.filtersTitle}>{t("search.filters")}</h2>
              <button
                type="button"
                className={`icon-btn ${styles.sheetClose}`}
                onClick={closeSheet}
                aria-label={t("search.closeFilters")}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <FilterPanel
              key={panelVersion}
              filters={filters}
              municipalities={municipalities}
              categories={categories}
              t={t}
              onNearMe={onNearMe}
              geoError={geoError}
            />
            <div className={styles.sheetFoot}>
              <button type="submit" className="btn btn--primary btn--block">
                {t("search.show")}
              </button>
              {keys.length ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => applyFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
                >
                  {t("search.resetAll")}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </search>

      <section className={styles.results} aria-labelledby="results-title" aria-busy={pending || undefined}>
        <div className={styles.resultsHead}>
          <h2 id="results-title" className={styles.count} aria-live="polite">
            {initial ? t("search.found", { count: total }) : t("state.errorTitle")}
          </h2>
          <div className={styles.sort}>
            <label htmlFor="f-sort" className="caption">
              {t("search.sort")}
            </label>
            <select
              id="f-sort"
              name="sort"
              form={FORM_ID}
              className="select"
              value={sort}
              onChange={(e) => applyFilters({ ...filters, sort: e.target.value as Filters["sort"] })}
            >
              {SORT_VALUES.filter((s) => s !== "distance" || filters.near).map((s) => (
                <option key={s} value={s}>
                  {t(`search.sort${s[0]!.toUpperCase()}${s.slice(1)}` as "search.sortDate")}
                </option>
              ))}
            </select>
          </div>
        </div>

        {keys.length ? (
          <div className={styles.active}>
            <h3 className="sr-only">{t("search.activeFilters")}</h3>
            <ul className="chips">
              {keys.map((key) => {
                const label = chipLabel(key);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`chip ${styles.activeChip}`}
                      onClick={() => applyFilters(withoutKey(filters, key))}
                      aria-label={t("search.removeFilter", { label })}
                    >
                      {label}
                      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M6 6l12 12M18 6 6 18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  className={`btn btn--ghost btn--small`}
                  onClick={() => applyFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
                >
                  {t("search.resetAll")}
                </button>
              </li>
            </ul>
          </div>
        ) : null}

        <div className={styles.feed} data-pending={pending || undefined}>
          {pending ? (
            <p className="sr-only" role="status">
              {t("common.loading")}
            </p>
          ) : null}
          {!initial ? (
            <StateMessage
              title={t("state.errorTitle")}
              text={t("state.errorText")}
              emotion="network-error"
              role="alert"
              action={
                <button type="button" className="btn btn--primary" onClick={() => router.refresh()}>
                  {t("common.retry")}
                </button>
              }
            />
          ) : items.length === 0 ? (
            <StateMessage
              title={t("search.emptyTitle")}
              text={t("search.emptyText")}
              emotion="not-found"
              action={
                keys.length ? (
                  <button type="button" className="btn btn--primary" onClick={() => applyFilters(EMPTY_FILTERS)}>
                    {t("search.emptyAction")}
                  </button>
                ) : undefined
              }
            />
          ) : groups ? (
            groups.map((g) => (
              <section key={g.date} className={styles.day} aria-labelledby={`day-${g.date}`}>
                <h3 id={`day-${g.date}`} className={styles.dayTitle}>
                  {dayHeading(g.date, lang, ctx.today)}
                  <span className={styles.dayCount}>{t("common.events", { count: g.items.length })}</span>
                </h3>
                <ul className="card-grid">
                  {g.items.map((item, i) => (
                    <li key={item.id}>
                      <EventCard
                        item={item}
                        ctx={ctx}
                        variant={variant}
                        headingLevel={4}
                        priority={i < 2 && g === groups[0]}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <ul className="card-grid">
              {items.map((item, i) => (
                <li key={item.id}>
                  <EventCard item={item} ctx={ctx} variant={variant} priority={i < 2} />
                </li>
              ))}
            </ul>
          )}

          {loadingMore ? (
            <ul className="card-grid" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <CardSkeleton />
                </li>
              ))}
            </ul>
          ) : null}

          {initial && items.length > 0 ? (
            <div className={styles.more}>
              {cursor ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={loadMore}
                  disabled={loadingMore}
                  aria-describedby="loaded-count"
                >
                  {loadingMore ? t("search.loadingMore") : t("search.loadMore")}
                </button>
              ) : (
                <p className="muted">{t("search.allLoaded")}</p>
              )}
              <p id="loaded-count" className="caption" aria-live="polite">
                {items.length} / {total}
              </p>
              {moreError ? (
                <p role="alert" className={styles.error}>
                  {t("state.errorTitle")}
                </p>
              ) : null}
            </div>
          ) : null}

          {surface === "site" && initial ? (
            <p className={`caption ${styles.feeds}`}>
              <a href={icalHref}>{t("search.subscribeIcal")}</a> · <a href={rssHref}>{t("search.rss")}</a>
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
