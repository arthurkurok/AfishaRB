/**
 * Сеансы учреждения по дням (в поясе региона): время, событие (ссылка на паспорт на сайте), площадка,
 * бейдж статуса и действия. Длительные события (выставки) — отдельной группой «Идут сейчас и долго».
 */
import type { OccurrenceCard } from "@afisha/contract";
import { dayHeading, regionParts } from "@afisha/i18n";
import { Icon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { siteEventUrl } from "@/lib/config";
import { formatSession, isoToZonedInputs, todayIn } from "@/lib/datetime";
import { statusBadge } from "@/lib/labels";
import { availableActions } from "@/lib/status";
import { SessionActionButtons } from "./session-actions";
import styles from "./session-list.module.css";

interface Group {
  key: string;
  title: string;
  items: OccurrenceCard[];
}

export function groupSessions(items: OccurrenceCard[], tz: string, today: string): Group[] {
  const ranged = items.filter((o) => o.is_range);
  const groups = new Map<string, OccurrenceCard[]>();
  for (const o of items) {
    if (o.is_range) continue;
    const day = regionParts(o.starts_at, tz).date;
    groups.set(day, [...(groups.get(day) ?? []), o]);
  }
  const out: Group[] = [];
  if (ranged.length) out.push({ key: "range", title: "Длительные события и выставки", items: ranged });
  for (const [day, list] of groups) out.push({ key: day, title: dayHeading(day, "ru", today), items: list });
  return out;
}

export function SessionList({ items, tz, now = new Date() }: { items: OccurrenceCard[]; tz: string; now?: Date }) {
  const today = todayIn(tz, now);
  const groups = groupSessions(items, tz, today);
  return (
    <div className={styles.groups}>
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`day-${g.key}`} className={styles.group}>
          <h3 id={`day-${g.key}`} className={styles.day}>
            {g.title}
          </h3>
          <ul className={styles.list}>
            {g.items.map((o) => {
              const badge = statusBadge(o);
              const when = o.is_range
                ? `до ${o.ends_at ? formatSession(o.ends_at, tz, now) : "—"}`
                : formatSession(o.starts_at, tz, now);
              const time = o.is_range ? "весь день" : isoToZonedInputs(o.starts_at, tz).time;
              const actions = availableActions(o, now);
              const inactive = o.status === "cancelled" || o.status === "ended" || o.status === "rescheduled";
              return (
                <li
                  key={o.id}
                  className={styles.item}
                  data-inactive={inactive ? "true" : undefined}
                  data-testid="session"
                >
                  <span className={`${styles.time} num`}>{time}</span>
                  <div className={styles.main}>
                    <a href={siteEventUrl(o.event.id)} target="_blank" rel="noreferrer" className={styles.title}>
                      {o.event.title}
                      <Icon name="external" size={14} />
                      <span className="sr-only"> (паспорт события на сайте, откроется в новой вкладке)</span>
                    </a>
                    <span className="caption">
                      {o.venue?.name ?? "Площадка не указана"}
                      {o.venue?.municipality ? `, ${o.venue.municipality}` : ""}
                    </span>
                    {o.previous_starts_at ? (
                      <span className="caption">Перенесено с {formatSession(o.previous_starts_at, tz, now)}</span>
                    ) : null}
                    {o.status_reason ? <span className="caption">Причина: {o.status_reason}</span> : null}
                  </div>
                  <div className={styles.meta}>
                    <span className="chip chip--age">{o.event.age_rating}+</span>
                    {badge ? (
                      <StatusBadge kind={badge.kind} label={badge.label} />
                    ) : (
                      <StatusBadge kind="scheduled" label="По плану" />
                    )}
                  </div>
                  <div className={styles.actions}>
                    {actions.length ? (
                      <SessionActionButtons
                        actions={actions}
                        session={{
                          id: o.id,
                          title: o.event.title,
                          when,
                          venue: o.venue?.name ?? null,
                          startsAt: o.starts_at,
                        }}
                      />
                    ) : (
                      <span className="caption">
                        {o.status === "rescheduled" ? "Новый сеанс — отдельной строкой" : "Изменения недоступны"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
