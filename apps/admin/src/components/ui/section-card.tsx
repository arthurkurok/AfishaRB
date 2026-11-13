import type { ReactNode } from "react";
import { CsvLink } from "./csv-link";

/** Карточка раздела с заголовком, пояснением и выгрузкой CSV. */
export function SectionCard({
  id,
  title,
  description,
  csvHref,
  actions,
  children,
  emphasis,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  csvHref?: string;
  actions?: ReactNode;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <section
      className="card stack"
      aria-labelledby={`${id}-title`}
      style={emphasis ? { borderBottom: "4px solid var(--color-accent)" } : undefined}
    >
      <div className="section-head" style={{ marginBottom: 0 }}>
        <div className="stack" style={{ gap: "var(--space-1)" }}>
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <div className="caption">{description}</div> : null}
        </div>
        <div className="chips">
          {actions}
          {csvHref ? <CsvLink href={csvHref} title={title} /> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
