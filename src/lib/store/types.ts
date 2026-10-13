import type {
  Booking,
  Business,
  MenuItem,
  NewBooking,
  NewBusiness,
  NewMenuItem,
  NewService,
  Service,
} from "../types";

export interface BookingFilter {
  from?: string;
  to?: string;
  includeCancelled?: boolean;
}

/** Thrown by `createBooking` when the slot filled up between the availability check and the insert. */
export class SlotTakenError extends Error {
  constructor() {
    super("That time slot was just taken.");
    this.name = "SlotTakenError";
  }
}

/** Thrown when one phone number already holds the maximum number of upcoming bookings. */
export class TooManyBookingsError extends Error {
  constructor() {
    super("This phone number already has too many upcoming bookings.");
    this.name = "TooManyBookingsError";
  }
}

/** Thrown when a business receives more assistant bookings in the last hour than it plausibly could. */
export class BookingRateLimitedError extends Error {
  constructor() {
    super("Too many bookings in the last hour.");
    this.name = "BookingRateLimitedError";
  }
}

export interface BookingLimits {
  capacity: number;
  /** 0 disables the check (owner bookings). */
  maxActivePerPhone: number;
  /** Max bookings with source "mcp" created in the last 60 minutes. 0 disables the check. */
  maxMcpPerHour: number;
  /** Business-local "today", YYYY-MM-DD — bookings before it don't count as active. */
  today: string;
}

export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`A business with the slug "${slug}" already exists.`);
    this.name = "DuplicateSlugError";
  }
}

/**
 * Persistence boundary. The in-memory store powers local dev, tests and the zero-config demo;
 * the Supabase store is used in production. Both must enforce capacity atomically in
 * `createBooking` — two customers asking for the last slot at once must not both get it.
 */
export interface Store {
  readonly kind: "memory" | "supabase";

  listBusinesses(): Promise<Business[]>;
  getBusinessBySlug(slug: string): Promise<Business | null>;
  createBusiness(input: NewBusiness): Promise<Business>;
  updateBusiness(id: string, patch: Partial<NewBusiness>): Promise<Business>;

  listServices(businessId: string): Promise<Service[]>;
  saveService(input: NewService & { id?: string }): Promise<Service>;
  deleteService(businessId: string, id: string): Promise<void>;

  listMenu(businessId: string): Promise<MenuItem[]>;
  saveMenuItem(input: NewMenuItem & { id?: string }): Promise<MenuItem>;
  deleteMenuItem(businessId: string, id: string): Promise<void>;

  listBookings(businessId: string, filter?: BookingFilter): Promise<Booking[]>;
  /**
   * Atomically re-checks capacity and the per-phone limit, then inserts.
   * Throws SlotTakenError / TooManyBookingsError.
   */
  createBooking(input: NewBooking, limits: BookingLimits): Promise<Booking>;
  /** Data retention: permanently deletes bookings dated before `date` (YYYY-MM-DD). Returns how many. */
  purgeBookingsBefore(date: string): Promise<number>;
  /** Owner-side cancel from the dashboard. */
  cancelBookingById(businessId: string, id: string): Promise<Booking | null>;
  /** Cancels an upcoming booking (date >= notBefore) by reference; the phone must match. */
  cancelBooking(businessId: string, reference: string, phone: string, notBefore: string): Promise<Booking | null>;
}
