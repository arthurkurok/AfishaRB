"use client";
/**
 * «Спросить Гида об этом событии» (03-functional-spec §1.5 п. 8, 05-ai-agent §2.8): ответ строится только
 * из полей карточки и площадки (POST /v1/assistant с event_id → kind "answer").
 */
import { type FormEvent, Fragment, useId, useRef, useState } from "react";
import { Mascot } from "@/brand/mascot";
import { askAssistant } from "@/lib/api";
import { useI18n } from "@/lib/i18n-client";
import styles from "./ask-about-event.module.css";

interface QA {
  id: number;
  q: string;
  a: string | null;
  error?: boolean;
}

/** Ссылки в ответе Гида делаем кликабельными; остальной текст выводится как текст (без HTML). */
function Linkified({ text }: { text: string }) {
  // Ключ — смещение фрагмента в тексте: стабилен и уникален.
  let offset = 0;
  const parts = text.split(/(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)])/g).map((part) => {
    const at = offset;
    offset += part.length;
    return { part, at };
  });
  return (
    <>
      {parts.map(({ part, at }) =>
        /^https?:\/\//.test(part) ? (
          <a key={at} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <Fragment key={at}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function AskAboutEvent({ eventId }: { eventId: string }) {
  const { lang, t } = useI18n();
  const id = useId();
  const [text, setText] = useState("");
  const [items, setItems] = useState<QA[]>([]);
  const [busy, setBusy] = useState(false);
  const conversation = useRef<string | undefined>(undefined);
  const seq = useRef(0);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setText("");
    const qid = ++seq.current;
    setItems((prev) => [...prev, { id: qid, q, a: null }]);
    try {
      const res = await askAssistant({ event_id: eventId, text: q, lang, conversation_id: conversation.current });
      conversation.current = res.conversation_id;
      setItems((prev) => prev.map((x) => (x.id === qid ? { ...x, a: res.text } : x)));
    } catch {
      setItems((prev) => prev.map((x) => (x.id === qid ? { ...x, a: t("guide.error"), error: true } : x)));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void ask(text);
  };

  return (
    <section className={styles.box} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <Mascot emotion="thinking" size={48} />
        <div>
          <h2 id={`${id}-title`} className={styles.title}>
            {t("event.askTitle")}
          </h2>
          <p className="caption">{t("event.askNote")}</p>
        </div>
      </div>
      {items.length ? (
        <ol className={styles.log} aria-live="polite">
          {items.map((x) => (
            <li key={x.id}>
              <p className={styles.q}>
                <span className="sr-only">{t("guide.you")}: </span>
                {x.q}
              </p>
              <p className={x.error ? styles.error : styles.a} role={x.error ? "alert" : undefined}>
                <span className="sr-only">{t("guide.bee")}: </span>
                {x.a === null ? t("guide.thinking") : <Linkified text={x.a} />}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <ul className={styles.examples}>
          {[t("event.ask1"), t("event.ask2"), t("event.ask3")].map((ex) => (
            <li key={ex}>
              <button type="button" className="chip chip-button" onClick={() => void ask(ex)} disabled={busy}>
                {ex}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.form} onSubmit={onSubmit}>
        <label htmlFor={`${id}-q`} className="sr-only">
          {t("event.askLabel")}
        </label>
        <input
          id={`${id}-q`}
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("event.askPlaceholder")}
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" className="btn btn--secondary" disabled={busy || !text.trim()}>
          {t("event.askSend")}
        </button>
      </form>
    </section>
  );
}
