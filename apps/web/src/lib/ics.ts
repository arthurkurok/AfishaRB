/**
 * iCalendar (RFC 5545) для кнопки «В календарь». Время — в UTC (Z), чтобы календарь показал его
 * в поясе пользователя без VTIMEZONE. Строки сворачиваются по 75 октетов.
 */
import type { EventDetail } from "@afisha/contract";

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Сворачивание строк: не больше 75 октетов UTF-8, продолжение начинается с пробела. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    const limit = out.length === 0 ? 75 : 74;
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function eventToIcs(
  event: EventDetail,
  pageUrl: string,
  opts: { occurrenceId?: string; now?: Date } = {},
): string {
  const stamp = icsDate((opts.now ?? new Date()).toISOString());
  const occurrences = opts.occurrenceId
    ? event.occurrences.filter((o) => o.id === opts.occurrenceId)
    : event.occurrences.filter((o) => o.status !== "ended");
  const host = (() => {
    try {
      return new URL(pageUrl).host;
    } catch {
      return "afisha";
    }
  })();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tamasha//Afisha RB//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const o of occurrences) {
    const end =
      o.ends_at && !o.is_range ? o.ends_at : new Date(new Date(o.starts_at).getTime() + 2 * 3600_000).toISOString();
    lines.push(
      "BEGIN:VEVENT",
      `UID:${o.id}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(o.starts_at)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(`${event.title} (${event.age_rating}+)`)}`,
      `DESCRIPTION:${icsEscape(`${event.summary}\n${pageUrl}`)}`,
      `URL:${pageUrl}`,
      `STATUS:${o.status === "cancelled" ? "CANCELLED" : o.status === "unverified" || o.status === "postponed" ? "TENTATIVE" : "CONFIRMED"}`,
    );
    if (o.venue) lines.push(`LOCATION:${icsEscape([o.venue.name, o.venue.address].filter(Boolean).join(", "))}`);
    if (o.venue?.geo) lines.push(`GEO:${o.venue.geo[0]};${o.venue.geo[1]}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
