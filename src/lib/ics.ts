/**
 * iCalendar feed of a business's agenda, so the owner sees Alexa+ bookings in the calendar app they
 * already use (iPhone, Google, Outlook) — no new app to check. Times are emitted in UTC, converted
 * from the business's wall-clock time zone, so every client renders them correctly across DST.
 */
import { createHmac } from "node:crypto";
import type { Booking, Business } from "./types";

/** Wall-clock time in `timeZone` → UTC Date (handles DST by re-checking the offset). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - ms;
  };
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess);
  return new Date(guess);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** RFC 5545 text escaping + 75-octet line folding. */
function escapeText(s: string) {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "") // RFC 5545 forbids control chars
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function calendarToken(slug: string, secret: string): string {
  return createHmac("sha256", secret).update(`calendar:${slug}`).digest("base64url").slice(0, 32);
}

export function buildIcs(business: Business, bookings: Booking[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barrio//Agenda//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(`${business.name} · Barrio`)}`,
    `X-WR-TIMEZONE:${business.timezone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const start = zonedTimeToUtc(b.date, b.time, business.timezone);
    const end = new Date(start.getTime() + b.durationMinutes * 60_000);
    const what = business.kind === "restaurant" ? `Table for ${b.partySize}` : b.serviceName;
    const description = [
      `Reference: ${b.reference}`,
      b.customerPhone ? `Phone: ${b.customerPhone}` : "",
      b.notes ? `Note: ${b.notes}` : "",
      b.source === "mcp" ? "Booked via Alexa+ (Barrio)" : "Added in the dashboard",
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@barrio`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(`${what} — ${b.customerName}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(business.address)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
