/**
 * Pure booking maths: which start times are free on a given day.
 * No I/O here, so the rules are easy to test and identical for every store.
 */
import type { Booking, Business, OpeningInterval } from "./types";
import { fromMinutes, toMinutes, weekdayOf, type LocalNow } from "./time";

/** Customers can't book a slot that starts sooner than this from now. */
export const MIN_LEAD_MINUTES = 30;
/** How far ahead the assistant is allowed to book. */
export const MAX_DAYS_AHEAD = 60;

export function intervalsFor(business: Pick<Business, "hours">, date: string): OpeningInterval[] {
  const wd = weekdayOf(date);
  return business.hours
    .filter((h) => h.weekday === wd)
    .sort((a, b) => toMinutes(a.opens) - toMinutes(b.opens));
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

/**
 * Most confirmed bookings in use at the same moment during [start, start+duration) on `date` —
 * the peak, not the number that merely overlap the window: with 90-minute tables, four at 20:00
 * and four at 21:30 never use more than four tables, so 20:30 is still bookable.
 */
export function concurrentBookings(
  bookings: Booking[],
  date: string,
  start: number,
  duration: number,
): number {
  const end = start + duration;
  const overlapping = bookings
    .filter((b) => b.status === "confirmed" && b.date === date)
    .map((b) => [toMinutes(b.time), toMinutes(b.time) + b.durationMinutes] as const)
    .filter(([s, e]) => overlaps(start, end, s, e));
  // Occupancy only goes up when a booking starts: the window start and each start inside it suffice.
  const points = [start, ...overlapping.map(([s]) => s).filter((s) => s > start)];
  return Math.max(0, ...points.map((p) => overlapping.filter(([s, e]) => s <= p && p < e).length));
}

export interface SlotQuery {
  business: Pick<Business, "hours" | "capacity" | "slotStepMinutes">;
  date: string;
  durationMinutes: number;
  bookings: Booking[];
  now: LocalNow;
  /**
   * Owner-entered bookings (walk-ins, phone calls) skip the customer-facing rules:
   * minimum notice and the start-time grid. Capacity and opening hours still apply.
   */
  ownerOverride?: boolean;
}

export type SlotRejection = "past" | "too_far" | "closed" | "outside_hours" | "off_grid" | "too_soon" | "full";

/** Why a specific start time can't be booked, or null if it can. */
export function checkSlot(query: SlotQuery, time: string): SlotRejection | null {
  const { business, date, durationMinutes, bookings, now } = query;
  if (date < now.date) return "past";
  const daysAhead = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${now.date}T00:00:00Z`)) / 86_400_000,
  );
  if (daysAhead > MAX_DAYS_AHEAD) return "too_far";

  const intervals = intervalsFor(business, date);
  if (intervals.length === 0) return "closed";

  const start = toMinutes(time);
  const end = start + durationMinutes;
  const fitting = intervals.filter((i) => start >= toMinutes(i.opens) && end <= toMinutes(i.closes));
  if (fitting.length === 0) return "outside_hours";

  const step = Math.max(5, business.slotStepMinutes);
  if (!query.ownerOverride && !fitting.some((i) => (start - toMinutes(i.opens)) % step === 0)) return "off_grid";
  if (date === now.date && !query.ownerOverride && start < now.minutes + MIN_LEAD_MINUTES) return "too_soon";
  if (concurrentBookings(bookings, date, start, durationMinutes) >= business.capacity) return "full";
  return null;
}

/** Every bookable start time on `date`, in order. */
export function availableSlots(query: SlotQuery): string[] {
  const { business, date, durationMinutes } = query;
  const step = Math.max(5, business.slotStepMinutes);
  const slots: string[] = [];
  for (const interval of intervalsFor(business, date)) {
    const open = toMinutes(interval.opens);
    const close = toMinutes(interval.closes);
    for (let t = open; t + durationMinutes <= close; t += step) {
      const time = fromMinutes(t);
      if (checkSlot(query, time) === null) slots.push(time);
    }
  }
  return slots;
}

/**
 * Collapses consecutive slots into ranges so a voice assistant can say
 * "from 9:00 to 11:30 and from 16:00 to 17:15" instead of reading 20 times.
 */
export function summarizeSlots(slots: string[], stepMinutes: number): string[] {
  if (slots.length === 0) return [];
  const ranges: string[] = [];
  let first = slots[0];
  let prev = slots[0];
  for (let i = 1; i <= slots.length; i++) {
    const current = slots[i];
    if (current && toMinutes(current) - toMinutes(prev) === stepMinutes) {
      prev = current;
      continue;
    }
    ranges.push(first === prev ? first : `${first}–${prev}`);
    if (current) {
      first = current;
      prev = current;
    }
  }
  return ranges;
}

/**
 * The free slots closest to a requested time — used to offer alternatives. Always includes the
 * nearest one on each side, so 17:00 at a split-shift restaurant offers 20:00 and not only lunch.
 */
export function nearestSlots(slots: string[], wanted: string, count = 3): string[] {
  const target = toMinutes(wanted);
  const before = slots.filter((s) => toMinutes(s) <= target).at(-1);
  const after = slots.find((s) => toMinutes(s) > target);
  const picked = new Set([before, after].filter((s): s is string => Boolean(s)));
  for (const s of [...slots].sort((a, b) => Math.abs(toMinutes(a) - target) - Math.abs(toMinutes(b) - target))) {
    if (picked.size >= count) break;
    picked.add(s);
  }
  return [...picked].slice(0, count).sort((a, b) => toMinutes(a) - toMinutes(b));
}

const REFERENCE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";

/** 4-character booking code, easy to read aloud (no 0/O, 1/I/L, 5/S, 8/B, 2/Z). */
export function generateReference(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)];
  }
  return out;
}
