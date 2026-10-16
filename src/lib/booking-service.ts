/**
 * Business logic behind every MCP tool. Pure-ish: takes a Store and a clock, returns plain data.
 * Errors that the customer can fix (bad date, slot gone…) are returned as `{ ok: false }` with a
 * message written for a voice assistant to read out, never thrown.
 */
import {
  availableSlots,
  checkSlot,
  MAX_DAYS_AHEAD,
  nearestSlots,
  summarizeSlots,
  type SlotRejection,
} from "./availability";
import { isPlausiblePhone, normalizePhone, phonesMatch } from "./phone";
import {
  BookingRateLimitedError,
  DuplicateBookingError,
  ServiceUnavailableError,
  SlotTakenError,
  TooManyBookingsError,
  type Store,
} from "./store/types";
import { EMAIL_RE } from "./forms";
import { conflictingMatches, formatPrice, rank, wantsGlutenFree } from "./text";
import {
  addDays,
  couldBeAfternoon,
  fromMinutes,
  nowInZone,
  normalizeTime,
  resolveDate,
  toMinutes,
  WEEKDAY_NAMES_EN,
  weekdayOf,
  type LocalNow,
} from "./time";
import type { Booking, Business, Service, Weekday } from "./types";

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string; code: string; [k: string]: unknown };

/** A single phone number can hold at most this many upcoming bookings per business (anti-spam). */
export const MAX_ACTIVE_BOOKINGS_PER_PHONE = 3;

/**
 * Ceiling on assistant bookings per business per rolling hour — far above real demand for a
 * barber or a restaurant, low enough that a script can't fill weeks of agenda with fake numbers.
 */
export function maxMcpBookingsPerHour(business: Pick<Business, "capacity" | "trusted">): number {
  if (!business.trusted) return 20;
  return Math.max(20, Math.min(business.capacity, 20) * 6);
}

export interface Clock {
  now(timeZone: string): LocalNow;
}

export interface BookingHooks {
  /** Called after an assistant booking is stored — e.g. to send confirmation emails after the response. */
  onBooked?: (event: { business: Business; booking: Booking; customerEmail?: string }) => void;
}

export const systemClock: Clock = { now: (tz) => nowInZone(tz) };

function describeHours(business: Business) {
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  return order.map((wd) => {
    const intervals = business.hours
      .filter((h) => h.weekday === wd)
      .sort((a, b) => a.opens.localeCompare(b.opens))
      .map((h) => `${h.opens}–${h.closes}`);
    return { day: WEEKDAY_NAMES_EN[wd], open: intervals.length > 0, hours: intervals.join(", ") || "closed" };
  });
}

const REJECTION_MESSAGES: Record<SlotRejection, string> = {
  past: "That date is in the past.",
  too_far: `Bookings can only be made up to ${MAX_DAYS_AHEAD} days ahead.`,
  closed: "The business is closed that day.",
  outside_hours: "That time is outside opening hours (or the appointment would run past closing time).",
  off_grid: "Appointments start at fixed times. Pick one of the suggested start times.",
  too_soon: "That time is too soon — bookings need at least 30 minutes' notice.",
  full: "That time is already fully booked.",
};

/** Dates are the business's local ones: say which day it is there, so the assistant can recover. */
function pastMessage(business: Business, now: LocalNow) {
  return `${REJECTION_MESSAGES.past} Today at ${business.name} is ${WEEKDAY_NAMES_EN[now.weekday]} ${now.date} (local time there).`;
}

type TimeWindow = { after?: string; before?: string };

/**
 * A spoken bound like "after 5" with no am/pm: 5 in the morning when the business is open then,
 * otherwise 5 in the afternoon when that falls within its hours that day ("after 8" at a barber
 * that opens at 9 stays 8 am; at a restaurant open until midnight it's 8 pm).
 */
function readBound(raw: string, opens: number | null, closes: number | null, side: "after" | "before"): string | null {
  const time = normalizeTime(raw);
  if (!time || !couldBeAfternoon(raw) || opens === null || closes === null) return time;
  const morning = toMinutes(time);
  const afternoon = morning + 12 * 60;
  const morningUseless = side === "after" ? morning < opens : morning <= opens;
  const afternoonFits = side === "after" ? afternoon < closes : afternoon <= closes;
  return morningUseless && afternoonFits ? fromMinutes(afternoon) : time;
}

function resolveWindow(
  business: Business,
  date: string,
  after?: string,
  before?: string,
): { ok: true; window?: TimeWindow; accepts: (slot: string) => boolean } | { ok: false; code: string; error: string } {
  if (!after?.trim() && !before?.trim()) return { ok: true, accepts: () => true };
  const today = business.hours.filter((h) => h.weekday === weekdayOf(date));
  const opens = today.length ? Math.min(...today.map((h) => toMinutes(h.opens))) : null;
  const closes = today.length ? Math.max(...today.map((h) => toMinutes(h.closes))) : null;
  const window: TimeWindow = {};
  for (const [side, raw] of [["after", after], ["before", before]] as const) {
    if (!raw?.trim()) continue;
    const time = readBound(raw, opens, closes, side);
    if (!time) return { ok: false, code: "invalid_time", error: `Couldn't understand "${raw}" as a time. Use 24-hour HH:MM, e.g. 17:00.` };
    window[side] = time;
  }
  if (window.after && window.before && window.after >= window.before) {
    return { ok: false, code: "invalid_time", error: `The window from ${window.after} to ${window.before} is empty. Ask the customer which times suit them.` };
  }
  return {
    ok: true,
    window,
    accepts: (slot) => (!window.after || slot >= window.after) && (!window.before || slot < window.before),
  };
}

function describeWindow(window?: TimeWindow): string {
  if (!window) return "";
  if (window.after && window.before) return `between ${window.after} and ${window.before}`;
  return window.after ? `from ${window.after}` : `before ${window.before}`;
}

/**
 * Failed cancellation attempts per business + phone, last 15 minutes, per instance. References are
 * 4 characters; this stops anyone who knows a customer's phone from enumerating them over MCP.
 * There is deliberately no business-wide lock: it would let anyone block every customer's cancel.
 */
const cancelFailures = new Map<string, number[]>();
function failedCancels(key: string, add: 0 | 1): number {
  const now = Date.now();
  const recent = (cancelFailures.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
  if (add) recent.push(now);
  cancelFailures.set(key, recent);
  if (cancelFailures.size > 5000) for (const [k, v] of cancelFailures) if (!v.some((t) => now - t < 15 * 60_000)) cancelFailures.delete(k);
  return recent.length;
}

export class BookingService {
  constructor(
    private store: Store,
    private clock: Clock = systemClock,
    private hooks: BookingHooks = {},
  ) {}

  now(business: Business) {
    return this.clock.now(business.timezone);
  }

  async getBusinessInfo(business: Business) {
    const now = this.now(business);
    return {
      view: "business" as const,
      name: business.name,
      type: business.kind,
      description: business.description,
      description_en: business.descriptionEn,
      address: business.address,
      phone: business.phone,
      timezone: business.timezone,
      currency: business.currency,
      local_now: { date: now.date, time: now.time, weekday: WEEKDAY_NAMES_EN[now.weekday] },
      opening_hours: describeHours(business),
      booking_rules: {
        min_notice_minutes: 30,
        max_days_ahead: MAX_DAYS_AHEAD,
        ...(business.kind === "restaurant"
          ? { table_duration_minutes: business.tableDurationMinutes, max_party_size: business.maxPartySize }
          : {}),
      },
    };
  }

  async getCatalog(business: Business, query?: string) {
    if (business.kind === "salon") {
      let services = (await this.store.listServices(business.id)).filter((s) => s.active);
      if (query?.trim()) {
        services = rank(query, services, (s) => [s.name, `${s.name} ${s.description}`, `${s.name} ${s.descriptionEn}`, ...s.aliases]).map((r) => r.item);
      }
      return {
        view: "services" as const,
        business: business.name,
        type: "services" as const,
        items: services.map((s) => ({
          id: s.id,
          name: s.name,
          also_known_as: s.aliases,
          description: s.description,
          description_en: s.descriptionEn,
          duration_minutes: s.durationMinutes,
          price: formatPrice(s.price, business.currency, s.priceFrom),
          price_amount: s.price,
          price_is_minimum: s.priceFrom,
        })),
      };
    }
    let menu = (await this.store.listMenu(business.id)).filter((m) => m.available);
    if (query?.trim()) {
      // "gluten-free options?" filters on the restaurant's own gluten-free flag, not on text.
      const { glutenFree, rest } = wantsGlutenFree(query);
      if (glutenFree) menu = menu.filter((m) => m.glutenFree === true && !m.allergens.includes("gluten"));
      if (rest) {
        // Matches stay in menu order: "burgers" reads the burgers as the restaurant lists them.
        const matched = new Set(rank(rest, menu, (m) => `${m.name} ${m.category} ${m.description} ${m.descriptionEn}`).map((r) => r.item));
        const narrowed = menu.filter((m) => matched.has(m));
        // "gluten free please", "I'm celiac": leftover words that match nothing mustn't empty the
        // gluten-free list — a coeliac customer would hear there's nothing for them.
        menu = glutenFree && narrowed.length === 0 ? menu : narrowed;
      }
    }
    const categories = new Map<string, typeof menu>();
    for (const item of menu) categories.set(item.category, [...(categories.get(item.category) ?? []), item]);
    return {
      view: "menu" as const,
      business: business.name,
      type: "menu" as const,
      categories: [...categories.entries()].map(([category, items]) => ({
        category,
        items: items.map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          description_en: m.descriptionEn,
          price: formatPrice(m.price, business.currency),
          price_amount: m.price,
          gluten_free: m.glutenFree === true && !m.allergens.includes("gluten"),
        })),
      })),
    };
  }

  async checkDish(business: Business, dishName: string): Promise<Result<{ view: "dish"; business: string; dish: Record<string, unknown> }>> {
    if (business.kind !== "restaurant") {
      return { ok: false, code: "not_a_restaurant", error: "This business doesn't have a menu." };
    }
    const menu = await this.store.listMenu(business.id);
    const ranked = rank(dishName, menu, (m) => m.name);
    const best = ranked[0];
    if (!best || best.score < 0.5) {
      return {
        ok: false,
        code: "dish_not_found",
        error: `No dish called "${dishName}" on the menu.`,
        suggestions: ranked.slice(0, 3).map((r) => r.item.name),
      };
    }
    const second = ranked[1];
    const others = conflictingMatches(dishName, ranked, (m) => m.name, (m) => `${m.category} ${m.description}`);
    if ((second && best.score < 1 && second.score >= 0.5 && best.score - second.score < 0.1) || others.length > 0) {
      const options = others.length ? [best.item, ...others] : ranked.filter((r) => r.score >= 0.5).map((r) => r.item);
      return {
        ok: false,
        code: "dish_ambiguous",
        error: `"${dishName}" matches more than one dish. Ask the customer which one they mean.`,
        options: options.slice(0, 5).map((m) => m.name),
      };
    }
    const m = best.item;
    // Never "yes, gluten-free" for a dish that also declares gluten: that's a data error to flag.
    const glutenConflict = m.glutenFree === true && m.allergensDeclared && m.allergens.includes("gluten");
    const allergenInfo = m.allergensDeclared
      ? m.allergens.length > 0
        ? `Declared allergens: ${m.allergens.join(", ")}.`
        : "The restaurant declares no allergens for this dish."
      : "The restaurant has not published allergen information for this dish. Do NOT guess: tell the customer to confirm allergens with the staff before ordering.";
    return {
      ok: true,
      view: "dish",
      business: business.name,
      dish: {
        id: m.id,
        name: m.name,
        category: m.category,
        description: m.description,
        description_en: m.descriptionEn,
        price: formatPrice(m.price, business.currency),
        price_amount: m.price,
        available: m.available,
        is_gluten_free: m.glutenFree === true && !glutenConflict,
        allergens_published: m.allergensDeclared,
        declared_allergens: m.allergensDeclared ? m.allergens : [],
        gluten_free: glutenConflict
          ? "Unclear — the menu marks it gluten-free but also declares gluten. Ask the staff before ordering."
          : m.glutenFree === true
            ? "Yes — listed as gluten-free by the restaurant."
            : "Not listed as gluten-free. Customers with coeliac disease should ask the staff.",
        allergens: allergenInfo,
      },
    };
  }

  private async resolveService(
    business: Business,
    serviceQuery: string | undefined,
  ): Promise<Result<{ service: Service | null; duration: number; label: string }>> {
    if (business.kind === "restaurant") {
      return { ok: true, service: null, duration: business.tableDurationMinutes, label: "Table" };
    }
    const services = (await this.store.listServices(business.id)).filter((s) => s.active);
    if (!serviceQuery?.trim()) {
      return {
        ok: false,
        code: "service_required",
        error: "Which service? Ask the customer to choose one.",
        options: services.map((s) => s.name),
      };
    }
    const byId = services.find((s) => s.id === serviceQuery);
    if (byId) return { ok: true, service: byId, duration: byId.durationMinutes, label: byId.name };
    const names = (s: Service) => [s.name, ...s.aliases];
    const ranked = rank(serviceQuery, services, names);
    const [first, second] = ranked;
    if (!first || first.score < 0.5) {
      return {
        ok: false,
        code: "service_not_found",
        error: `"${serviceQuery}" isn't one of the services offered.`,
        options: services.map((s) => s.name),
      };
    }
    const others = conflictingMatches(serviceQuery, ranked, names, (s) => s.description);
    if ((second && first.score < 1 && first.score - second.score < 0.1) || others.length > 0) {
      const options = others.length ? [first.item, ...others] : ranked.map((r) => r.item);
      return {
        ok: false,
        code: "service_ambiguous",
        error: `"${serviceQuery}" could mean more than one service. Ask the customer which one.`,
        options: options.slice(0, 4).map((s) => s.name),
      };
    }
    return { ok: true, service: first.item, duration: first.item.durationMinutes, label: first.item.name };
  }

  private resolveDateOrError(business: Business, input: string): Result<{ date: string; now: LocalNow }> {
    const now = this.now(business);
    const date = resolveDate(input, now.date);
    if (!date) {
      return {
        ok: false,
        code: "invalid_date",
        error: `Couldn't understand the date "${input}". Use YYYY-MM-DD. Today is ${now.date} (${WEEKDAY_NAMES_EN[now.weekday]}).`,
      };
    }
    return { ok: true, date, now };
  }

  private checkPartySize(business: Business, partySize: number | undefined): Result<{ partySize: number }> {
    if (business.kind !== "restaurant") return { ok: true, partySize: 1 };
    if (partySize === undefined) {
      return { ok: false, code: "party_size_required", error: "How many people? Ask the customer." };
    }
    if (!Number.isInteger(partySize) || partySize < 1) {
      return { ok: false, code: "invalid_party_size", error: "The number of people must be a whole number of at least 1." };
    }
    if (partySize > business.maxPartySize) {
      return {
        ok: false,
        code: "party_too_large",
        error: `Groups larger than ${business.maxPartySize} must call the restaurant directly on ${business.phone}.`,
      };
    }
    return { ok: true, partySize };
  }

  async checkAvailability(
    business: Business,
    args: { date: string; service?: string; party_size?: number; after?: string; before?: string },
  ): Promise<Result<Record<string, unknown>>> {
    const d = this.resolveDateOrError(business, args.date);
    if (!d.ok) return d;
    const svc = await this.resolveService(business, args.service);
    if (!svc.ok) return svc;
    const party = this.checkPartySize(business, args.party_size);
    if (!party.ok) return party;
    const win = resolveWindow(business, d.date, args.after, args.before);
    if (!win.ok) return win;

    const bookings = await this.store.listBookings(business.id, { from: d.date, to: d.date });
    const query = { business, date: d.date, durationMinutes: svc.duration, bookings, now: d.now };
    const daySlots = availableSlots(query);
    // "After five": the server narrows the list, so the assistant never has to filter it itself.
    const slots = daySlots.filter(win.accepts);
    const weekday = WEEKDAY_NAMES_EN[weekdayOf(d.date)];
    const windowField = win.window ? { time_window: win.window } : {};

    if (slots.length === 0 && daySlots.length > 0) {
      return {
        ok: true,
        view: "availability",
        business: business.name,
        date: d.date,
        weekday,
        service: svc.label,
        duration_minutes: svc.duration,
        ...(business.kind === "restaurant" ? { party_size: party.partySize } : {}),
        ...windowField,
        available: false,
        message: `Nothing free ${describeWindow(win.window)} that day. Offer the other times that day or the next days.`,
        other_times_that_day: nearestSlots(daySlots, win.window?.after ?? win.window?.before ?? daySlots[0]),
        next_available: await this.nextAvailableDays(business, d.date, svc.duration, d.now, win.accepts),
      };
    }

    if (slots.length === 0) {
      const reason = checkSlot(query, "12:00");
      const why =
        reason === "past"
          ? pastMessage(business, d.now)
          : reason === "too_far" || reason === "closed"
            ? REJECTION_MESSAGES[reason]
            : "No free times left that day.";
      return {
        ok: true,
        view: "availability",
        business: business.name,
        date: d.date,
        weekday,
        service: svc.label,
        duration_minutes: svc.duration,
        ...(business.kind === "restaurant" ? { party_size: party.partySize } : {}),
        ...windowField,
        available: false,
        message: why,
        next_available: await this.nextAvailableDays(business, d.date, svc.duration, d.now, win.accepts),
      };
    }
    return {
      ok: true,
      view: "availability",
      business: business.name,
      date: d.date,
      weekday,
      service: svc.label,
      duration_minutes: svc.duration,
      ...(business.kind === "restaurant" ? { party_size: party.partySize } : {}),
      ...windowField,
      available: true,
      start_time_ranges: summarizeSlots(slots, business.slotStepMinutes),
      note: `Ranges are possible START times for a ${svc.duration}-minute ${business.kind === "restaurant" ? "table" : "appointment"}, every ${business.slotStepMinutes} minutes.`,
      start_times: slots,
    };
  }

  private async nextAvailableDays(business: Business, from: string, duration: number, now: LocalNow, accepts: (slot: string) => boolean = () => true) {
    const out: { date: string; weekday: string; first_time: string }[] = [];
    // A date already gone at the business (a US evening is the next day in Spain): start from
    // today there, and include today itself.
    const past = from < now.date;
    const start = past ? now.date : from;
    // Only the fortnight it looks at: a busy business's whole future agenda isn't needed here.
    const bookings = await this.store.listBookings(business.id, { from: start, to: addDays(start, 14) });
    for (let i = past ? 0 : 1; i <= 14 && out.length < 3; i++) {
      const [y, m, dd] = start.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, dd + i)).toISOString().slice(0, 10);
      const slots = availableSlots({ business, date, durationMinutes: duration, bookings, now }).filter(accepts);
      if (slots.length) out.push({ date, weekday: WEEKDAY_NAMES_EN[weekdayOf(date)], first_time: slots[0] });
    }
    return out;
  }

  async createBooking(
    business: Business,
    args: {
      date: string;
      time: string;
      service?: string;
      party_size?: number;
      customer_name: string;
      customer_phone: string;
      customer_email?: string;
      notes?: string;
    },
    source: Booking["source"] = "mcp",
  ): Promise<Result<{ view: "booking"; booking: Record<string, unknown>; message: string }>> {
    const owner = source === "dashboard";
    const name = args.customer_name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 80) {
      return { ok: false, code: "invalid_name", error: "Please provide the customer's name (max 80 characters)." };
    }
    const phoneGiven = args.customer_phone.trim() !== "";
    const email = args.customer_email?.trim() ?? "";
    if (email && !EMAIL_RE.test(email)) {
      return { ok: false, code: "invalid_email", error: "That email address doesn't look right. Ask the customer to spell it." };
    }
    if ((!owner || phoneGiven) && !isPlausiblePhone(args.customer_phone)) {
      return { ok: false, code: "invalid_phone", error: "That phone number doesn't look valid. Ask the customer to repeat it." };
    }
    const spokenTime = normalizeTime(args.time);
    if (!spokenTime) {
      return { ok: false, code: "invalid_time", error: `Couldn't understand the time "${args.time}". Use 24h HH:MM.` };
    }
    const d = this.resolveDateOrError(business, args.date);
    if (!d.ok) return d;
    const svc = await this.resolveService(business, args.service);
    if (!svc.ok) return svc;
    const party = this.checkPartySize(business, args.party_size);
    if (!party.ok) return party;

    const upcoming = await this.store.listBookings(business.id, { from: d.now.date });
    const mine = phoneGiven ? upcoming.filter((b) => phonesMatch(b.customerPhone, args.customer_phone)) : [];
    const dayBookings = upcoming.filter((b) => b.date === d.date);
    const query = { business, date: d.date, durationMinutes: svc.duration, bookings: dayBookings, now: d.now, ownerOverride: owner };
    let time = spokenTime;
    let rejection = checkSlot(query, time);
    // "8:30" with no am/pm when 08:30 is closed or already gone but 20:30 isn't: they meant 20:30.
    const wrongHalfOfDay = (r: typeof rejection) => r === "outside_hours" || r === "past" || r === "too_soon";
    if (wrongHalfOfDay(rejection) && couldBeAfternoon(args.time)) {
      const afternoon = fromMinutes(toMinutes(time) + 12 * 60);
      const afternoonRejection = checkSlot(query, afternoon);
      // Switch unless the evening reading is just as impossible (closed, or already gone); "too soon"
      // tonight is still the time they meant, and the right thing to tell them.
      if (afternoonRejection !== "outside_hours" && afternoonRejection !== "past") {
        time = afternoon;
        rejection = afternoonRejection;
      }
    }
    // A retried request (the host timed out and asked again) gets the booking it already made; the
    // same customer at the same time with different details is a different request.
    const already = mine.find((b) => b.date === d.date && b.time === time);
    if (already && already.partySize === party.partySize && already.serviceId === (svc.service?.id ?? null)) {
      return this.confirmation(business, already, true);
    }
    if (already) return { ok: false, code: "duplicate", error: "This customer already has a booking at that exact time." };
    if (!owner && mine.length >= MAX_ACTIVE_BOOKINGS_PER_PHONE) {
      return {
        ok: false,
        code: "too_many_bookings",
        error: `This phone number already has ${mine.length} upcoming bookings here. Cancel one first or call ${business.phone}.`,
      };
    }
    if (rejection) {
      const alternatives = nearestSlots(availableSlots({ ...query, ownerOverride: false }), time);
      return {
        ok: false,
        code: `slot_${rejection}`,
        error: rejection === "past" ? pastMessage(business, d.now) : REJECTION_MESSAGES[rejection],
        alternatives,
      };
    }

    try {
      const booking = await this.store.createBooking(
        {
          businessId: business.id,
          date: d.date,
          time,
          durationMinutes: svc.duration,
          serviceId: svc.service?.id ?? null,
          serviceName: svc.label,
          partySize: party.partySize,
          customerName: name,
          customerPhone: phoneGiven ? normalizePhone(args.customer_phone) : "",
          notes: (args.notes ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300),
          source,
        },
        {
          capacity: business.capacity,
          maxActivePerPhone: owner ? 0 : MAX_ACTIVE_BOOKINGS_PER_PHONE,
          maxMcpPerHour: owner ? 0 : maxMcpBookingsPerHour(business),
          today: d.now.date,
        },
      );
      if (source === "mcp") {
        try {
          this.hooks.onBooked?.({ business, booking, customerEmail: email || undefined });
        } catch {
          /* notifications must never break a booking */
        }
      }
      return this.confirmation(business, booking, false);
    } catch (error) {
      if (error instanceof DuplicateBookingError) {
        const existing = (await this.store.listBookings(business.id, { from: d.date, to: d.date })).find((b) => b.reference === error.reference);
        // Only ever show a customer their own booking.
        if (existing && phonesMatch(existing.customerPhone, args.customer_phone)) return this.confirmation(business, existing, true);
      }
      if (error instanceof ServiceUnavailableError) {
        return {
          ok: false,
          code: "service_not_found",
          error: "That service is no longer offered. Ask the customer to choose another one.",
          options: (await this.store.listServices(business.id)).filter((s) => s.active).map((s) => s.name),
        };
      }
      if (error instanceof BookingRateLimitedError) {
        return {
          ok: false,
          code: "rate_limited",
          error: `${business.name} is receiving an unusual number of bookings right now. Please call ${business.phone} to book.`,
        };
      }
      if (error instanceof TooManyBookingsError) {
        return {
          ok: false,
          code: "too_many_bookings",
          error: `This phone number already has ${MAX_ACTIVE_BOOKINGS_PER_PHONE} upcoming bookings here. Cancel one first or call ${business.phone}.`,
        };
      }
      if (error instanceof SlotTakenError) {
        const fresh = await this.store.listBookings(business.id, { from: d.date, to: d.date });
        return {
          ok: false,
          code: "slot_taken",
          error: "Someone booked that time a moment ago.",
          alternatives: nearestSlots(availableSlots({ ...query, bookings: fresh }), time),
        };
      }
      // Anything else (database down, a constraint we didn't foresee): never read raw database
      // errors to a customer.
      console.error(JSON.stringify({ evt: "booking_error", tenant: business.slug, message: String(error) }));
      return {
        ok: false,
        code: "unavailable",
        error: `The booking couldn't be completed right now. Please try again in a moment or call ${business.phone}.`,
      };
    }
  }

  private confirmation(business: Business, booking: Booking, alreadyBooked: boolean) {
    const when = `${WEEKDAY_NAMES_EN[weekdayOf(booking.date)]} ${booking.date} at ${booking.time}`;
    const what = business.kind === "restaurant" ? `a table for ${booking.partySize}` : booking.serviceName;
    const reference = booking.reference.split("").join(" ");
    return {
      ok: true as const,
      view: "booking" as const,
      message: alreadyBooked
        ? `Already booked: ${what} at ${business.name}, ${when}. Reference ${reference}.`
        : `Booked ${what} at ${business.name}, ${when}. Reference ${reference}.`,
      booking: {
        reference: booking.reference,
        business: business.name,
        address: business.address,
        phone: business.phone,
        date: booking.date,
        weekday: WEEKDAY_NAMES_EN[weekdayOf(booking.date)],
        time: booking.time,
        duration_minutes: booking.durationMinutes,
        service: booking.serviceName,
        party_size: booking.partySize,
        customer_name: booking.customerName,
      },
    };
  }

  async cancelBooking(
    business: Business,
    args: { reference: string; customer_phone: string },
  ): Promise<Result<{ view: "cancellation"; business: string; reference: string; date: string; time: string; message: string }>> {
    const reference = args.reference.replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(reference)) {
      return { ok: false, code: "invalid_reference", error: "Booking references are 4 characters, e.g. K7Q3." };
    }
    // Garbage isn't worth a database round trip (or a lockout bucket of its own).
    if (!isPlausiblePhone(args.customer_phone)) {
      return { ok: false, code: "invalid_phone", error: "Please provide the phone number used for the booking." };
    }
    const phoneKey = normalizePhone(args.customer_phone).slice(-9);
    if (failedCancels(`${business.id}:${phoneKey}`, 0) >= 5) {
      return {
        ok: false,
        code: "too_many_attempts",
        error: `Too many attempts. Please try again later or call ${business.phone}.`,
      };
    }
    const now = this.now(business);
    const result = await this.store.cancelBooking(business.id, reference, args.customer_phone, { date: now.date, time: now.time });
    if (!result) {
      failedCancels(`${business.id}:${phoneKey}`, 1);
      return {
        ok: false,
        code: "not_found",
        error: "No upcoming booking matches that reference and phone number.",
      };
    }
    const { booking, alreadyCancelled } = result;
    return {
      ok: true,
      view: "cancellation",
      business: business.name,
      reference: booking.reference,
      date: booking.date,
      time: booking.time,
      message: alreadyCancelled
        ? `Booking ${booking.reference} on ${booking.date} at ${booking.time} was already cancelled.`
        : `Cancelled booking ${booking.reference} on ${booking.date} at ${booking.time}.`,
    };
  }
}
