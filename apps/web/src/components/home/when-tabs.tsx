"use client";
/**
 * Переключатель «Сегодня / Завтра / Выходные» (паттерн WAI-ARIA Tabs: стрелки, Home/End).
 * Содержимое панелей отрисовано на сервере и передано как ReactNode — переключение мгновенное, без запросов.
 */
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import styles from "./when-tabs.module.css";

export interface WhenPanel {
  id: string;
  label: string;
  content: ReactNode;
}

export function WhenTabs({ panels, label }: { panels: WhenPanel[]; label: string }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = panels.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = active === last ? 0 : active + 1;
    if (e.key === "ArrowLeft") next = active === 0 ? last : active - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      setActive(next);
      tabs.current[next]?.focus();
    }
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.tablist}>
        {panels.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${p.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${p.id}`}
            tabIndex={i === active ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(i)}
            onKeyDown={onKey}
            data-testid={`when-tab-${p.id}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${baseId}-panel-${p.id}`}
          aria-labelledby={`${baseId}-tab-${p.id}`}
          hidden={i !== active}
          className={styles.panel}
        >
          {p.content}
        </div>
      ))}
    </div>
  );
}
