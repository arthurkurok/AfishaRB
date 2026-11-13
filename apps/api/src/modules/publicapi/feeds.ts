/** Фиды: iCal (RFC 5545) и RSS — для календарей, СМИ и пабликов. */
import type { OccurrenceCard } from "@afisha/contract";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, ";").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

function fold(line: string): string {
  // RFC 5545: строки не длиннее 75 октетов
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) {
      out.push(cur);
      cur = ` ${ch}`;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export function toIcal(items: OccurrenceCard[], title: string, baseUrl: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Afisha RB//Тамаша//RU",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(title)}`,
    "X-WR-TIMEZONE:Asia/Yekaterinburg",
  ];
  for (const c of items) {
    const end =
      c.ends_at && !c.is_range ? c.ends_at : new Date(new Date(c.starts_at).getTime() + 2 * 3600_000).toISOString();
    lines.push(
      "BEGIN:VEVENT",
      `UID:${c.id}@afisha-rb`,
      `DTSTAMP:${utc(new Date().toISOString())}`,
      `DTSTART:${utc(c.starts_at)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(`${c.event.title} (${c.event.age_rating}+)`)}`,
      `LOCATION:${esc([c.venue?.name, c.venue?.address].filter(Boolean).join(", "))}`,
      `DESCRIPTION:${esc(`${c.event.summary}\n${baseUrl}/e/${c.event.id}`)}`,
      `URL:${baseUrl}/e/${c.event.id}`,
      `STATUS:${c.status === "cancelled" ? "CANCELLED" : c.status === "unverified" ? "TENTATIVE" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toRss(items: OccurrenceCard[], title: string, baseUrl: string): string {
  const entries = items
    .map(
      (c) =>
        `<item><title>${x(`${c.event.title} — ${c.event.age_rating}+`)}</title><link>${baseUrl}/e/${c.event.id}</link>` +
        `<guid isPermaLink="false">${c.id}</guid><description>${x(`${c.starts_at.slice(0, 16).replace("T", " ")} · ${c.venue?.name ?? ""} · ${c.event.summary}`)}</description></item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(title)}</title><link>${baseUrl}</link><description>Афиша культуры Башкортостана</description><language>ru</language>${entries}</channel></rss>`;
}
