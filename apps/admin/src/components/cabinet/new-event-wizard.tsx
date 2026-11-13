"use client";
/**
 * «Новое событие» (03-functional-spec §7, ИИ-помощник заполнения): шаг 1 — текст анонса или поста VK,
 * шаг 2 — форма с заполненными полями (подсветка уверенности, предупреждения, обязательный возрастной знак),
 * публикация после проверки той же схемой CabinetEventCreate, что и на сервере. Черновик не публикуется сам.
 */
import type { VenueListItem } from "@afisha/contract";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icons";
import { extractDraft, publishEvent, searchVenues } from "@/lib/actions/cabinet";
import type { EventDraft } from "@/lib/admin-types";
import {
  AGE_RATINGS,
  CONFIDENCE_LABEL,
  type Confidence,
  draftToValues,
  type EventFormValues,
  emptyValues,
  FIELD_ORDER,
  type FieldErrors,
  type FieldName,
  fieldConfidence,
  relevantWarnings,
  validateEventForm,
} from "@/lib/event-form";
import styles from "./new-event-wizard.module.css";

interface VenueOption {
  id: string;
  name: string;
  address: string | null;
}

const FIELD_LABEL: Partial<Record<FieldName, string>> = {
  title: "Название",
  categories: "Категории",
  age_rating: "Возрастной знак",
  date: "Дата начала",
  time: "Время начала",
  end_time: "Время окончания",
  venue_id: "Площадка",
  summary: "Краткое описание",
  price_min: "Цена от",
  price_max: "Цена до",
  ticket_url: "Ссылка на билеты",
};

export function NewEventWizard({
  orgId,
  orgName,
  venues: initialVenues,
  categories,
  tz,
  tzLabel,
}: {
  orgId: string;
  orgName: string;
  venues: VenueOption[];
  categories: { code: string; label: string }[];
  tz: string;
  tzLabel: string;
}) {
  const uid = useId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [values, setValues] = useState<EventFormValues>(() => ({
    ...emptyValues(orgId),
    venue_id: initialVenues.length === 1 ? initialVenues[0]!.id : "",
  }));
  const [venues, setVenues] = useState<VenueOption[]>(initialVenues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [published, setPublished] = useState<{ eventId: string; url: string; title: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(false);

  // При смене шага фокус — на заголовок шага (скринридер объявляет, где мы).
  // biome-ignore lint/correctness/useExhaustiveDependencies: реагируем только на смену шага
  useEffect(() => {
    // При первом открытии страницы фокус не переносим — только при смене шага.
    if (mounted.current) headingRef.current?.focus();
    mounted.current = true;
  }, [step]);

  const set = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const runExtract = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await extractDraft(text);
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      setDraft(res.draft);
      setValues(draftToValues(res.draft, orgId, values.venue_id));
      setErrors({});
      setStep(2);
    });
  };

  const manual = () => {
    setDraft(null);
    setErrors({});
    setMessage(null);
    setStep(2);
  };

  const focusFirstError = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (!first) return;
    const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
    el?.focus();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const local = validateEventForm(values, tz);
    if (!local.ok) {
      setErrors(local.errors);
      summaryRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await publishEvent(values);
      if (res.ok) {
        setPublished({ eventId: res.eventId, url: res.url, title: values.title.trim() });
        setStep(3);
        return;
      }
      setErrors(res.errors ?? {});
      setMessage(res.message ?? "Не удалось опубликовать событие");
      if (res.errors) focusFirstError(res.errors);
      else summaryRef.current?.focus();
    });
  };

  const again = () => {
    setText("");
    setDraft(null);
    setValues({ ...emptyValues(orgId), venue_id: values.venue_id });
    setPublished(null);
    setErrors({});
    setMessage(null);
    setStep(1);
  };

  const conf = (field: FieldName) => fieldConfidence(draft, field, values);
  const errorList = FIELD_ORDER.filter((f) => errors[f]);
  const errId = (f: FieldName) => `${uid}-${f}-err`;
  const fieldError = (f: FieldName) =>
    errors[f] ? (
      <p id={errId(f)} className="field-error">
        <Icon name="alert" size={16} />
        {errors[f]}
      </p>
    ) : null;
  const describedBy = (f: FieldName, ...extra: string[]) =>
    [errors[f] ? errId(f) : "", ...extra].filter(Boolean).join(" ") || undefined;

  return (
    <div className="stack" style={{ gap: "var(--space-5)" }}>
      <ol className={styles.steps} aria-label="Шаги">
        <li aria-current={step === 1 ? "step" : undefined} data-done={step > 1 ? "true" : undefined}>
          <span className={styles.stepNum} aria-hidden="true">
            <span>1</span>
          </span>{" "}
          Текст анонса{step > 1 ? <span className="sr-only"> — готово</span> : null}
        </li>
        <li aria-current={step === 2 ? "step" : undefined} data-done={step > 2 ? "true" : undefined}>
          <span className={styles.stepNum} aria-hidden="true">
            <span>2</span>
          </span>{" "}
          Проверка и публикация{step > 2 ? <span className="sr-only"> — готово</span> : null}
        </li>
      </ol>

      {step === 1 ? (
        <form className="card stack" onSubmit={runExtract} aria-labelledby={`${uid}-s1`}>
          <h2 id={`${uid}-s1`} ref={headingRef} tabIndex={-1}>
            Вставьте текст анонса или пост VK
          </h2>
          <p className="muted">
            Помощник найдёт название, дату, время, цену, возрастной знак и категорию. Вы проверите каждое поле перед
            публикацией — сам по себе черновик в афишу не попадает.
          </p>
          <div className="field">
            <label htmlFor={`${uid}-text`}>Текст анонса</label>
            <textarea
              id={`${uid}-text`}
              className={`textarea ${styles.source}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={8000}
              required
              aria-describedby={`${uid}-text-hint`}
              placeholder={
                "Например:\nБашкирский театр кукол приглашает на спектакль «Лиса-сирота» 15 ноября в 11:00. Билеты от 300 рублей. 0+"
              }
            />
            <p id={`${uid}-text-hint`} className="field-hint">
              {text.length} из 8000 знаков. Телефоны и e-mail из текста не отправляются в ИИ — их маскирует шлюз.
            </p>
          </div>
          {message ? (
            <p className="notice notice--error" role="alert">
              <Icon name="alert" /> <span>{message}</span>
            </p>
          ) : null}
          <div className="chips">
            <button type="submit" className="btn btn--primary" disabled={pending || text.trim().length < 10}>
              <Icon name="sparkle" size={18} />
              {pending ? "Разбираем текст…" : "Заполнить форму"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={manual}>
              Заполнить вручную
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form ref={formRef} className="card stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-s2`}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2 id={`${uid}-s2`} ref={headingRef} tabIndex={-1}>
              Проверьте и опубликуйте
            </h2>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setStep(1)}>
              ← К тексту анонса
            </button>
          </div>
          <p className="caption">
            Учреждение: <strong>{orgName}</strong>. Событие из кабинета — официальный источник: публикуется сразу, с
            пометкой «Кабинет учреждения» в паспорте.
          </p>

          {draft ? (
            <div className={styles.draftInfo}>
              <p>
                <Icon name="sparkle" size={18} />{" "}
                {draft.mode === "llm"
                  ? "Поля заполнены с помощью ИИ (GigaChat) и правил."
                  : "Поля заполнены по правилам, без ИИ."}{" "}
                Отметки у полей:{" "}
                <span className={styles.legend}>
                  <ConfidenceChip c="high" /> <ConfidenceChip c="check" /> <ConfidenceChip c="missing" />
                </span>
              </p>
              {relevantWarnings(draft).length ? (
                <ul className="rhombus-list" aria-label="Предупреждения помощника">
                  {relevantWarnings(draft).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div ref={summaryRef} tabIndex={-1} className={styles.summary}>
            {errorList.length || message ? (
              <div className="notice notice--error" role="alert">
                <Icon name="alert" />
                <div className="stack" style={{ gap: "var(--space-1)" }}>
                  <strong>{message ?? "Проверьте поля формы"}</strong>
                  {errorList.length ? (
                    <ul className={styles.errorList}>
                      {errorList.map((f) => (
                        <li key={f}>
                          <a
                            href={`#${uid}-${f}`}
                            onClick={(e) => {
                              e.preventDefault();
                              formRef.current?.querySelector<HTMLElement>(`[data-field="${f}"]`)?.focus();
                            }}
                          >
                            {FIELD_LABEL[f] ?? f}: {errors[f]}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="field" data-conf={conf("title") ?? undefined}>
            <div className={styles.labelRow}>
              <label htmlFor={`${uid}-title`}>Название</label>
              <ConfidenceChip c={conf("title")} />
            </div>
            <input
              id={`${uid}-title`}
              data-field="title"
              className="input"
              value={values.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={200}
              required
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={describedBy("title")}
            />
            {fieldError("title")}
          </div>

          <fieldset className="field" aria-describedby={describedBy("categories")}>
            <legend className={styles.labelRow}>
              Категории <ConfidenceChip c={conf("categories")} />
            </legend>
            <div className={styles.checks}>
              {categories.map((c, i) => (
                <label key={c.code} className="check">
                  <input
                    type="checkbox"
                    data-field={i === 0 ? "categories" : undefined}
                    checked={values.categories.includes(c.code)}
                    onChange={(e) =>
                      set(
                        "categories",
                        e.target.checked
                          ? [...values.categories, c.code]
                          : values.categories.filter((x) => x !== c.code),
                      )
                    }
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
            {fieldError("categories")}
          </fieldset>

          <fieldset className="field" aria-describedby={describedBy("age_rating", `${uid}-age-hint`)}>
            <legend className={styles.labelRow}>
              Возрастной знак (обязательно) <ConfidenceChip c={conf("age_rating")} />
            </legend>
            <div className={styles.ages}>
              {AGE_RATINGS.map((a, i) => (
                <label key={a} className={styles.age}>
                  <input
                    type="radio"
                    name={`${uid}-age`}
                    value={a}
                    data-field={i === 0 ? "age_rating" : undefined}
                    checked={values.age_rating === String(a)}
                    onChange={() => set("age_rating", String(a))}
                  />
                  <span>{a}+</span>
                </label>
              ))}
            </div>
            <p id={`${uid}-age-hint`} className="field-hint">
              Без возрастного знака событие не публикуется (436-ФЗ «О защите детей от информации…»).
            </p>
            {fieldError("age_rating")}
          </fieldset>

          <div className={styles.row3}>
            <div className="field">
              <div className={styles.labelRow}>
                <label htmlFor={`${uid}-date`}>Дата начала</label>
                <ConfidenceChip c={conf("date")} />
              </div>
              <input
                id={`${uid}-date`}
                data-field="date"
                type="date"
                className="input"
                value={values.date}
                onChange={(e) => set("date", e.target.value)}
                required
                aria-invalid={errors.date ? true : undefined}
                aria-describedby={describedBy("date")}
              />
              {fieldError("date")}
            </div>
            <div className="field">
              <div className={styles.labelRow}>
                <label htmlFor={`${uid}-time`}>Начало ({tzLabel})</label>
                <ConfidenceChip c={conf("time")} />
              </div>
              <input
                id={`${uid}-time`}
                data-field="time"
                type="time"
                className="input"
                value={values.time}
                onChange={(e) => set("time", e.target.value)}
                step={300}
                required
                aria-invalid={errors.time ? true : undefined}
                aria-describedby={describedBy("time", `${uid}-tz-hint`)}
              />
              {fieldError("time")}
            </div>
            <div className="field">
              <label htmlFor={`${uid}-end`}>Окончание (необязательно)</label>
              <input
                id={`${uid}-end`}
                data-field="end_time"
                type="time"
                className="input"
                value={values.end_time}
                onChange={(e) => set("end_time", e.target.value)}
                step={300}
                aria-invalid={errors.end_time ? true : undefined}
                aria-describedby={describedBy("end_time", `${uid}-tz-hint`)}
              />
              {fieldError("end_time")}
            </div>
          </div>
          <p id={`${uid}-tz-hint`} className="field-hint">
            Время — по часовому поясу региона ({tzLabel}), независимо от настроек вашего компьютера.
          </p>

          <VenueField
            uid={uid}
            value={values.venue_id}
            venues={venues}
            error={errors.venue_id}
            onChange={(id) => set("venue_id", id)}
            onAdd={(v) => {
              setVenues((list) => (list.some((x) => x.id === v.id) ? list : [...list, v]));
              set("venue_id", v.id);
            }}
          />

          <div className="field">
            <label htmlFor={`${uid}-summary`}>Краткое описание</label>
            <textarea
              id={`${uid}-summary`}
              data-field="summary"
              className="textarea"
              value={values.summary}
              onChange={(e) => set("summary", e.target.value)}
              maxLength={600}
              aria-invalid={errors.summary ? true : undefined}
              aria-describedby={describedBy("summary", `${uid}-summary-count`)}
            />
            <p id={`${uid}-summary-count`} className="field-hint">
              {values.summary.length} из 600 знаков. Пишите о том, что увидит зритель; без телефонов и e-mail.
            </p>
            {fieldError("summary")}
          </div>

          <fieldset className="stack" style={{ gap: "var(--space-2)" }}>
            <legend>Цена и билеты</legend>
            <label className="check">
              <input type="checkbox" checked={values.is_free} onChange={(e) => set("is_free", e.target.checked)} />
              <span>Вход свободный (бесплатно)</span>
            </label>
            <div className={styles.row3}>
              <div className="field">
                <label htmlFor={`${uid}-pmin`}>Цена от, ₽</label>
                <input
                  id={`${uid}-pmin`}
                  data-field="price_min"
                  className="input"
                  inputMode="decimal"
                  value={values.is_free ? "" : values.price_min}
                  onChange={(e) => set("price_min", e.target.value)}
                  disabled={values.is_free}
                  aria-invalid={errors.price_min ? true : undefined}
                  aria-describedby={describedBy("price_min")}
                />
                {fieldError("price_min")}
              </div>
              <div className="field">
                <label htmlFor={`${uid}-pmax`}>Цена до, ₽</label>
                <input
                  id={`${uid}-pmax`}
                  data-field="price_max"
                  className="input"
                  inputMode="decimal"
                  value={values.is_free ? "" : values.price_max}
                  onChange={(e) => set("price_max", e.target.value)}
                  disabled={values.is_free}
                  aria-invalid={errors.price_max ? true : undefined}
                  aria-describedby={describedBy("price_max")}
                />
                {fieldError("price_max")}
              </div>
              <div className="field">
                <label htmlFor={`${uid}-ticket`}>Ссылка на билеты</label>
                <input
                  id={`${uid}-ticket`}
                  data-field="ticket_url"
                  type="url"
                  className="input"
                  placeholder="https://"
                  value={values.ticket_url}
                  onChange={(e) => set("ticket_url", e.target.value)}
                  aria-invalid={errors.ticket_url ? true : undefined}
                  aria-describedby={describedBy("ticket_url")}
                />
                {fieldError("ticket_url")}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={values.pushkin_card}
                onChange={(e) => set("pushkin_card", e.target.checked)}
              />
              <span>Можно оплатить Пушкинской картой</span>
            </label>
          </fieldset>

          <p className="notice">
            <Icon name="info" />
            <span>
              После публикации событие сразу появится на сайте, в боте и в приложениях. Изменить статус сеанса можно в
              кабинете.
            </span>
          </p>

          <div className="chips">
            <button type="submit" className="btn btn--primary" disabled={pending} aria-busy={pending || undefined}>
              {pending ? "Публикуем…" : "Опубликовать событие"}
            </button>
            <Link href={`/cabinet?org=${orgId}`} className="btn btn--ghost">
              Отмена
            </Link>
          </div>
        </form>
      ) : null}

      {step === 3 && published ? (
        <section
          className="card stack"
          aria-labelledby={`${uid}-s3`}
          style={{ borderBottom: "4px solid var(--color-meadow)" }}
        >
          <h2 id={`${uid}-s3`} ref={headingRef} tabIndex={-1}>
            <Icon name="check" size={24} /> Событие опубликовано
          </h2>
          <p>
            «{published.title}» уже в афише. Паспорт события на сайте:{" "}
            <a href={published.url} target="_blank" rel="noreferrer" data-testid="published-link">
              {published.url}
              <span className="sr-only"> (откроется в новой вкладке)</span>
            </a>
          </p>
          <div className="chips">
            <a href={published.url} target="_blank" rel="noreferrer" className="btn btn--primary">
              <Icon name="external" size={18} />
              Открыть на сайте
            </a>
            <Link href={`/cabinet?org=${orgId}`} className="btn btn--secondary">
              К сеансам учреждения
            </Link>
            <button type="button" className="btn btn--ghost" onClick={again}>
              Добавить ещё одно
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ConfidenceChip({ c }: { c: Confidence | null }) {
  if (!c) return null;
  return (
    <span className={styles.conf} data-conf={c}>
      <Icon name={c === "high" ? "check" : c === "check" ? "info" : "alert"} size={14} />
      {CONFIDENCE_LABEL[c]}
    </span>
  );
}

function VenueField({
  uid,
  value,
  venues,
  error,
  onChange,
  onAdd,
}: {
  uid: string;
  value: string;
  venues: VenueOption[];
  error?: string;
  onChange: (id: string) => void;
  onAdd: (v: VenueOption) => void;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<VenueListItem[] | null>(null);
  const [pending, startTransition] = useTransition();
  const search = () =>
    startTransition(async () => {
      setFound(await searchVenues(q));
    });
  return (
    <div className="field">
      <label htmlFor={`${uid}-venue`}>Площадка</label>
      <select
        id={`${uid}-venue`}
        data-field="venue_id"
        className="select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${uid}-venue_id-err` : `${uid}-venue-hint`}
      >
        <option value="">— выберите площадку —</option>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.address ? ` — ${v.address}` : ""}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${uid}-venue_id-err`} className="field-error">
          <Icon name="alert" size={16} />
          {error}
        </p>
      ) : (
        <p id={`${uid}-venue-hint`} className="field-hint">
          В списке — площадки, где у учреждения уже есть события. Другую площадку можно найти ниже.
        </p>
      )}
      <details className={styles.venueSearch}>
        <summary>Другая площадка</summary>
        <div className={styles.venueRow}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor={`${uid}-venue-q`}>Название площадки</label>
            <input
              id={`${uid}-venue-q`}
              className="input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  search();
                }
              }}
            />
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={search}
            disabled={pending || q.trim().length < 2}
          >
            {pending ? "Ищем…" : "Найти"}
          </button>
        </div>
        <div role="status" aria-live="polite">
          {found === null ? null : found.length === 0 ? (
            <p className="caption">
              Площадок не нашли. Если площадки нет в справочнике — сообщите модератору министерства.
            </p>
          ) : (
            <ul className={styles.venueList}>
              {found.map((v) => (
                <li key={v.id}>
                  <span>
                    <strong>{v.name}</strong>
                    <span className="caption"> {[v.address, v.organization].filter(Boolean).join(" · ")}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={() => onAdd({ id: v.id, name: v.name, address: v.address })}
                  >
                    Выбрать
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}
