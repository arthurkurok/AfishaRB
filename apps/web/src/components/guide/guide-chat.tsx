"use client";
/**
 * Чат с ИИ-гидом (05-ai-agent, 07-design §7). Карточки событий строятся из данных API по ID,
 * текст модели — только пояснения, прошедшие верификатор фактов на сервере.
 * Чипы понимания запроса: сплошной контур — сказано пользователем, пунктир — достроено/по умолчанию.
 * История разговора хранится в sessionStorage (только эта вкладка), чтобы вернуться к ней из карточки события.
 */
import type { AssistantResponse, Municipality, QuickReply, SlotChip } from "@afisha/contract";
import { addDays, formatDate, nextSaturday, todayIn } from "@afisha/i18n";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mascot, type MascotEmotion } from "@/brand/mascot";
import { type CardContext, EventCard } from "@/components/event/event-card";
import { askAssistant } from "@/lib/api";
import { REGION_TZ } from "@/lib/config";
import { hrefs, localePath, type Surface } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import { readPref } from "@/lib/prefs";
import styles from "./guide-chat.module.css";

type Turn =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; res: AssistantResponse }
  | { id: string; role: "error"; retry: { text?: string; patch?: Record<string, unknown> } };

const STORE_KEY = "afisha.guide.v1";

const EMOTION: Record<AssistantResponse["kind"], MascotEmotion> = {
  results: "found",
  clarify: "clarify",
  empty: "not-found",
  answer: "thinking",
  offtopic: "greeting",
  help: "greeting",
  error: "network-error",
};

interface ChipOption {
  label: string;
  patch: Record<string, unknown>;
}

let seq = 0;
const nextId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

export function GuideChat({
  initialQuery,
  eventId,
  municipalities,
  surface = "site",
  onBusyChange,
}: {
  initialQuery?: string;
  eventId?: string;
  municipalities: Municipality[];
  surface?: Surface;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { lang, t } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [openChip, setOpenChip] = useState<string | null>(null);
  const started = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  const ctx: CardContext = useMemo(
    () => ({ lang, t, tz: REGION_TZ, today: todayIn(REGION_TZ), hrefs: hrefs(lang, surface) }),
    [lang, t, surface],
  );

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const persist = useCallback(
    (next: Turn[], conv?: string) => {
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify({ turns: next.slice(-30), conversationId: conv, lang }));
      } catch {
        /* хранилище недоступно — разговор живёт до перезагрузки */
      }
    },
    [lang],
  );

  const send = useCallback(
    async (input: { text?: string; patch?: Record<string, unknown>; label?: string }) => {
      const userText = input.text ?? input.label;
      setOpenChip(null);
      setBusy(true);
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setTurns((prev) => {
        const clean = prev.filter((x) => x.role !== "error");
        return userText ? [...clean, { id: nextId(), role: "user", text: userText }] : clean;
      });
      try {
        const city = readPref("afisha.city") ?? undefined;
        const res = await askAssistant(
          {
            conversation_id: conversationId,
            text: input.text,
            patch: input.patch,
            lang,
            municipality_id: city,
            event_id: eventId,
          },
          controller.signal,
        );
        setConversationId(res.conversation_id);
        setTurns((prev) => {
          const next: Turn[] = [...prev, { id: nextId(), role: "assistant", res }];
          persist(next, res.conversation_id);
          return next;
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setTurns((prev) => [...prev, { id: nextId(), role: "error", retry: { text: input.text, patch: input.patch } }]);
      } finally {
        setBusy(false);
      }
    },
    [conversationId, eventId, lang, persist],
  );

  // Первый запрос из адреса (?q=) или восстановление разговора этой вкладки.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialQuery) {
      void send({ text: initialQuery });
      return;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as {
        turns: Turn[];
        conversationId?: string;
        lang?: string;
      } | null;
      if (saved?.turns?.length && saved.lang === lang && !eventId) {
        setTurns(saved.turns);
        setConversationId(saved.conversationId);
      }
    } catch {
      /* повреждённая запись — начинаем заново */
    }
  }, [initialQuery, send, lang, eventId]);

  // Новые сообщения — прокрутка к концу (без анимации при prefers-reduced-motion).
  // biome-ignore lint/correctness/useExhaustiveDependencies: прокручиваем и при появлении индикатора «подбирает»
  useEffect(() => {
    if (!turns.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    logEnd.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [turns.length, busy]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    void send({ text: value });
  };

  const reset = () => {
    abort.current?.abort();
    setTurns([]);
    setConversationId(undefined);
    setBusy(false);
    try {
      sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* ничего */
    }
    inputRef.current?.focus();
  };

  const today = ctx.today;
  const chipOptions = (chip: SlotChip): ChipOption[] => {
    const date = (from: string, to: string, label: string) => ({
      label,
      patch: { date_from: from, date_to: to, date_label: label, date_source: "user" },
    });
    switch (chip.slot) {
      case "date": {
        const sat = nextSaturday(today);
        return [
          date(today, today, t("when.today")),
          date(addDays(today, 1), addDays(today, 1), t("when.tomorrow")),
          date(sat, sat, formatDate(sat, lang, { weekday: true, capital: true })),
          date(sat, addDays(sat, 1), t("when.weekend")),
          date(today, addDays(today, 6), t("when.week")),
        ];
      }
      case "municipality":
        return [...municipalities]
          .sort((a, b) => (b.upcoming ?? 0) - (a.upcoming ?? 0))
          .slice(0, 8)
          .map(
            (m): ChipOption => ({
              label: m.name,
              patch: { municipality_id: m.id, municipality_label: m.name_ru, municipality_source: "user" },
            }),
          )
          .concat([
            {
              label: t("search.allPlaces"),
              patch: { municipality_id: null, municipality_label: "вся республика", municipality_source: "user" },
            },
          ]);
      case "budget":
        return [
          { label: t("common.free"), patch: { free_only: true, budget: null } },
          ...[500, 1000, 2000].map((p) => ({
            label: t("guide.budgetUpTo", { price: p }),
            patch: { budget: p, budget_per: "ticket", free_only: false },
          })),
          { label: t("guide.noBudget"), patch: { budget: null, free_only: false } },
        ];
      case "kids":
        return [
          ...[2, 5, 8, 13].map((age) => ({
            label: t("guide.kidAge", { age }),
            patch: { with_kids: true, kids_ages: [age] },
          })),
        ];
      // Остальные условия только снимаются — кнопкой «×» с готовым патчем chip.clear от API.
      default:
        return [];
    }
  };

  const sourceLabel = (s: SlotChip["source"]) =>
    s === "user"
      ? t("guide.sourceUser")
      : s === "inferred"
        ? t("guide.sourceInferred")
        : s === "profile"
          ? t("guide.sourceProfile")
          : t("guide.sourceDefault");

  const lastAssistant = [...turns].reverse().find((x) => x.role === "assistant") as
    | Extract<Turn, { role: "assistant" }>
    | undefined;
  const rulesMode = lastAssistant?.res.mode === "rules";
  const examples = [t("home.example1"), t("home.example2"), t("home.example3"), t("home.example4")];

  return (
    <div className={styles.chat}>
      {rulesMode ? (
        <div className={`notice ${styles.rules}`} role="note" data-testid="rules-banner">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M12 3l9 9-9 9-9-9z M12 8v5 M12 16v.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </svg>
          <div>
            <p className={styles.rulesTitle}>{t("guide.rulesTitle")}</p>
            <p className="caption">{t("guide.rulesText")}</p>
          </div>
        </div>
      ) : null}

      <div className={styles.log} role="log" aria-live="polite" aria-relevant="additions" aria-label={t("guide.title")}>
        {turns.length === 0 && !busy ? (
          <div className={styles.empty}>
            <Mascot emotion="greeting" size={96} />
            <div>
              <p>{t("guide.emptyChat")}</p>
              <p className="caption">{t("guide.examples")}</p>
              <ul className={styles.examples}>
                {examples.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      className={`chip chip-button ${styles.example}`}
                      onClick={() => void send({ text: ex })}
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        {turns.map((turn) => {
          if (turn.role === "user") {
            return (
              <div key={turn.id} className={styles.user}>
                <span className="sr-only">{t("guide.you")}: </span>
                <p>{turn.text}</p>
              </div>
            );
          }
          if (turn.role === "error") {
            return (
              <div key={turn.id} className={styles.bot} role="alert">
                <Mascot emotion="network-error" size={56} className={styles.avatar} />
                <div className={styles.bubble}>
                  <p>{t("guide.error")}</p>
                  <button type="button" className="btn btn--primary btn--small" onClick={() => void send(turn.retry)}>
                    {t("common.retry")}
                  </button>
                </div>
              </div>
            );
          }
          const r = turn.res;
          const isLast = turn === lastAssistant;
          return (
            <div key={turn.id} className={styles.bot} data-kind={r.kind}>
              <Mascot emotion={EMOTION[r.kind]} size={56} className={styles.avatar} />
              <div className={styles.bubble}>
                <span className="sr-only">{t("guide.bee")}: </span>
                <p className={styles.text}>{r.text}</p>

                {r.chips.length ? (
                  <div className={styles.understood}>
                    <p className="caption" id={`${turn.id}-chips`}>
                      {t("guide.understood")}
                    </p>
                    <ul className={styles.chips} aria-labelledby={`${turn.id}-chips`}>
                      {r.chips.map((chip, ci) => {
                        const key = `${turn.id}-${ci}`;
                        const options = isLast ? chipOptions(chip) : [];
                        return (
                          <li key={key} className={styles.chipWrap}>
                            {options.length ? (
                              <button
                                type="button"
                                className={styles.slot}
                                data-source={chip.source}
                                aria-expanded={openChip === key}
                                aria-controls={`${key}-menu`}
                                aria-label={`${chip.label} — ${sourceLabel(chip.source)}. ${t("guide.editChip", { label: chip.label })}`}
                                onClick={() => setOpenChip((v) => (v === key ? null : key))}
                              >
                                {chip.label}
                                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path
                                    d="M6 9l6 6 6-6"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </button>
                            ) : (
                              <span className={styles.slot} data-source={chip.source}>
                                {chip.label}
                                <span className="sr-only"> — {sourceLabel(chip.source)}</span>
                              </span>
                            )}
                            {isLast && chip.clear ? (
                              <button
                                type="button"
                                className={styles.clear}
                                aria-label={t("guide.removeChipLabel", { label: chip.label })}
                                title={t("guide.removeChipLabel", { label: chip.label })}
                                disabled={busy}
                                onClick={() =>
                                  void send({
                                    patch: chip.clear ?? {},
                                    label: t("guide.removeChipLabel", { label: chip.label }),
                                  })
                                }
                              >
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
                            ) : null}
                            {openChip === key ? (
                              <ChipMenu
                                id={`${key}-menu`}
                                label={t("guide.chipMenu", { label: chip.label })}
                                options={options}
                                onPick={(o) => void send({ patch: o.patch, label: o.label })}
                                onClose={() => setOpenChip(null)}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {isLast ? <p className={`caption ${styles.legend}`}>{t("guide.legend")}</p> : null}
                  </div>
                ) : null}

                {r.clarify ? (
                  <div className={styles.clarify}>
                    <p className={r.clarify.question === r.text ? "sr-only" : styles.question} id={`${turn.id}-q`}>
                      {r.clarify.question}
                    </p>
                    <ul className={styles.options} aria-labelledby={`${turn.id}-q`}>
                      {r.clarify.options.map((o: QuickReply) => (
                        <li key={o.id}>
                          <button
                            type="button"
                            className="chip chip-button"
                            disabled={!isLast || busy}
                            onClick={() => void send({ patch: o.patch, label: o.label })}
                          >
                            {o.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {r.relaxed.length ? (
                  <p className="notice">{t("guide.relaxed", { list: r.relaxed.join(", ") })}</p>
                ) : null}

                {r.picks.length ? (
                  <div className={styles.picks}>
                    <h2 className="sr-only">{t("guide.picks")}</h2>
                    <ul className={styles.pickList}>
                      {r.picks.map((p) => (
                        <li key={p.occurrence.id}>
                          <EventCard
                            item={p.occurrence}
                            ctx={ctx}
                            headingLevel={3}
                            footer={
                              <div className={styles.reasons}>
                                <p className="sr-only">{t("guide.why")}:</p>
                                <ul className={styles.reasonChips}>
                                  {p.reason_codes.map((code) => (
                                    <li key={code} className={styles.reason}>
                                      {t(`reasons.${code}`)}
                                    </li>
                                  ))}
                                </ul>
                                {p.reason_text ? <p className={styles.reasonText}>{p.reason_text}</p> : null}
                              </div>
                            }
                          />
                        </li>
                      ))}
                    </ul>
                    <p className="caption">
                      {t("guide.recommendNote")}{" "}
                      <Link href={`${localePath(lang, "/about")}#recommendations`}>{t("guide.recommendLink")}</Link>
                    </p>
                  </div>
                ) : null}

                {r.followups.length && isLast ? (
                  <div className={styles.followups}>
                    <p className="caption" id={`${turn.id}-f`}>
                      {t("guide.followups")}
                    </p>
                    <ul className={styles.options} aria-labelledby={`${turn.id}-f`}>
                      {r.followups.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            className="chip chip-button"
                            disabled={busy}
                            onClick={() => void send({ patch: f.patch, label: f.label })}
                          >
                            {f.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {busy ? (
          <div className={styles.bot} role="status">
            <Mascot emotion="loading" size={56} className={`${styles.avatar} ${styles.flying}`} />
            <div className={styles.bubble}>
              <p className={styles.thinking}>{t("guide.thinking")}</p>
            </div>
          </div>
        ) : null}
        <div ref={logEnd} />
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <label htmlFor="guide-input" className="sr-only">
          {t("guide.inputLabel")}
        </label>
        <textarea
          id="guide-input"
          ref={inputRef}
          className={`textarea ${styles.input}`}
          rows={1}
          maxLength={1000}
          placeholder={t("guide.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          enterKeyHint="send"
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
          {t("guide.send")}
        </button>
        {turns.length ? (
          <button type="button" className="btn btn--ghost" onClick={reset}>
            {t("guide.newChat")}
          </button>
        ) : null}
      </form>
    </div>
  );
}

/** Меню вариантов для чипа: стрелки вверх/вниз, Esc закрывает. */
function ChipMenu({
  id,
  label,
  options,
  onPick,
  onClose,
}: {
  id: string;
  label: string;
  options: ChipOption[];
  onPick: (o: ChipOption) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return (
    // biome-ignore lint/a11y/useSemanticElements: группа кнопок-вариантов (WAI-ARIA group), fieldset здесь неуместен
    <div
      id={id}
      ref={ref}
      role="group"
      aria-label={label}
      className={styles.menu}
      onKeyDown={(e) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          (ref.current?.previousElementSibling as HTMLElement | null)?.focus();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          buttons[(i + 1) % buttons.length]?.focus();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
        }
      }}
    >
      {options.map((o) => (
        <button key={o.label} type="button" className={styles.menuItem} onClick={() => onPick(o)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
