/**
 * Wall-clock helpers. Bookings live in the business's local time ("YYYY-MM-DD" + "HH:MM"),
 * so the only place a real time zone is needed is "what is 'now' over there?".
 */
import type { Weekday } from "./types";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Accepts "9:00", "09:00", "9", "9.30", "930", "9:30 pm" → "HH:MM", or null. */
export function normalizeTime(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, " ");
  const pm = /(\d|\s)p\.?m\.?$/.test(raw);
  const am = /(\d|\s)a\.?m\.?$/.test(raw);
  const core = raw.replace(/\s*[ap]\.?m\.?$/, "").replace(/h$/, "");
  let h: number;
  let m: number;
  let match = /^(\d{1,2})[:.h](\d{2})$/.exec(core);
  if (match) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else if ((match = /^(\d{1,2})$/.exec(core))) {
    h = Number(match[1]);
    m = 0;
  } else if ((match = /^(\d{1,2})(\d{2})$/.exec(core))) {
    h = Number(match[1]);
    m = Number(match[2]);
  } else {
    return null;
  }
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export interface LocalNow {
  date: string;
  time: string;
  weekday: Weekday;
  minutes: number;
}

/** Current wall-clock date/time in an IANA time zone. `at` is injectable for tests. */
export function nowInZone(timeZone: string, at: Date = new Date()): LocalNow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}`;
  return { date, time, weekday: weekdayOf(date), minutes: toMinutes(time) };
}

export const WEEKDAY_NAMES_EN = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_NAMES_ES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Resolves what a voice assistant is likely to send: an ISO date, "today"/"tomorrow"
 * (English or Spanish) or a weekday name (next occurrence after today).
 * Returns null when the input can't be understood, so the tool can ask for clarification.
 */
export function resolveDate(input: string, today: string): string | null {
  const raw = stripAccents(input.trim().toLowerCase())
    .replace(/^(on|next|this|el|este|el proximo|proximo)\s+/, "")
    .trim();
  if (isValidDate(raw)) return raw;
  if (raw === "today" || raw === "hoy") return today;
  if (raw === "tomorrow" || raw === "manana") return addDays(today, 1);
  if (raw === "day after tomorrow" || raw === "pasado manana") return addDays(today, 2);

  const todayWeekday = weekdayOf(today);
  const names = [...WEEKDAY_NAMES_EN.map((n) => n.toLowerCase()), ...WEEKDAY_NAMES_ES.map(stripAccents)];
  const idx = names.indexOf(raw);
  if (idx >= 0) {
    const target = idx % 7;
    let delta = (target - todayWeekday + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(today, delta);
  }
  return null;
}
