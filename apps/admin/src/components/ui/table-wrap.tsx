import type { ReactNode } from "react";

/**
 * Обёртка широкой таблицы: на узком экране таблица прокручивается по горизонтали внутри себя, а не вся страница
 * (WCAG 1.4.10). Область фокусируется с клавиатуры, чтобы её можно было прокрутить стрелками (WCAG 2.1.1).
 */
export function TableWrap({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: прокручиваемая область должна быть доступна с клавиатуры
    <section className="table-wrap" aria-label={label} tabIndex={0}>
      {children}
    </section>
  );
}
