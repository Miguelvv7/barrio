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

const WORD_HOURS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/**
 * Accepts "9:00", "09:00", "9", "9.30", "930", "9:30 pm", "17:30 h", "at 5:30 pm", "a las 17:30",
 * "noon", "half past five" → "HH:MM", or null.
 */
export function normalizeTime(input: string): string | null {
  let raw = input.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!?]+$/, "");
  raw = raw.replace(/^(at|around|about|a las|a la|sobre las)\s+/, "").replace(/\s*(o'clock|horas|hrs|h)$/, "");
  if (raw === "noon" || raw === "midday" || raw === "mediodia" || raw === "mediodía") return "12:00";
  const half = /^(half past|quarter past|quarter to) (\w+)(?: (am|pm|a\.m\.|p\.m\.))?$/.exec(raw);
  if (half) {
    const h = WORD_HOURS[half[2]] ?? Number(half[2]);
    if (!Number.isInteger(h) || h < 1 || h > 12) return null;
    const offset = half[1] === "half past" ? 30 : half[1] === "quarter past" ? 15 : -15;
    const total = h * 60 + offset;
    return normalizeTime(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}${half[3] ? ` ${half[3]}` : ""}`);
  }
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

/**
 * "8:30" said to a restaurant usually means 20:30. True when the input has no am/pm and an hour
 * of 1–11 written without a leading zero, so the caller may try the afternoon reading too.
 */
export function couldBeAfternoon(input: string): boolean {
  const raw = input.trim().toLowerCase();
  // Explicit am/pm, a 24-hour style leading zero ("08:30") or noon: the speaker already chose.
  if (/\d\s*[ap]\.?m\.?|\s[ap]\.?m\.?$/.test(raw) || /(^|\D)0\d/.test(raw)) return false;
  const time = normalizeTime(raw);
  if (!time) return false;
  const hour = Number(time.slice(0, 2));
  return hour >= 1 && hour <= 11;
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
  let raw = stripAccents(input.trim().toLowerCase()).replace(/\s+/g, " ").replace(/[.,!?]+$/, "");
  // An ISO date-time ("2026-11-20T19:00:00"): the date part is what matters here.
  const iso = /^(\d{4}-\d{2}-\d{2})[t ]\d{2}:\d{2}/.exec(raw);
  if (iso) raw = iso[1];
  // "this tuesday" / "este martes" may mean today; plain or "next" weekday names never do.
  let allowToday = false;
  for (;;) {
    const m = /^(on|for|next|this|coming|el|la|para|este|esta|proximo|proxima|que viene) /.exec(raw);
    if (!m) break;
    if (m[1] === "this" || m[1] === "este" || m[1] === "esta") allowToday = true;
    raw = raw.slice(m[0].length);
  }
  raw = raw.replace(/ (que viene|proximo|proxima)$/, "").trim();
  if (isValidDate(raw)) return raw;
  if (["today", "hoy", "tonight", "noche", "evening", "afternoon", "morning", "tarde"].includes(raw)) return today;
  if (raw === "tomorrow" || raw === "manana") return addDays(today, 1);
  if (raw === "tomorrow night" || raw === "tomorrow evening" || raw === "manana por la noche" || raw === "manana por la tarde") {
    return addDays(today, 1);
  }
  if (raw === "day after tomorrow" || raw === "pasado manana") return addDays(today, 2);

  const todayWeekday = weekdayOf(today);
  const names = [...WEEKDAY_NAMES_EN.map((n) => n.toLowerCase()), ...WEEKDAY_NAMES_ES.map(stripAccents)];
  const idx = names.indexOf(raw);
  if (idx >= 0) {
    const target = idx % 7;
    let delta = (target - todayWeekday + 7) % 7;
    if (delta === 0 && !allowToday) delta = 7;
    return addDays(today, delta);
  }
  return null;
}
