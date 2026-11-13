import type { OccurrenceCard } from "@afisha/contract";
import Link from "next/link";
import { type CardContext, EventCard } from "@/components/event/event-card";
import styles from "./collection.module.css";

/** Подборка на главной: заголовок, пояснение, «Показать все» и горизонтальная лента карточек. */
export function Collection({
  id,
  title,
  lead,
  href,
  items,
  ctx,
  accent = "var(--color-accent)",
}: {
  id: string;
  title: string;
  lead: string;
  href: string;
  items: OccurrenceCard[];
  ctx: CardContext;
  accent?: string;
}) {
  if (!items.length) return null;
  return (
    <section className={styles.section} aria-labelledby={`col-${id}`} style={{ ["--col-accent" as string]: accent }}>
      <div className="section-head">
        <div>
          <h2 id={`col-${id}`} className={styles.title}>
            {title}
          </h2>
          <p className="muted">{lead}</p>
        </div>
        <Link href={href} className={styles.all}>
          {ctx.t("common.showAll")}
          <span className="sr-only">: {title}</span>
        </Link>
      </div>
      <ul className="rail">
        {items.map((item) => (
          <li key={item.id}>
            <EventCard item={item} ctx={ctx} />
          </li>
        ))}
      </ul>
    </section>
  );
}
