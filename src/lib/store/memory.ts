import { randomUUID } from "node:crypto";
import { concurrentBookings, generateReference } from "../availability";
import { phonesMatch } from "../phone";
import { SEED_TENANTS } from "../seed";
import { toMinutes } from "../time";
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
import {
  BookingRateLimitedError,
  DuplicateBookingError,
  DuplicateSlugError,
  isUpcoming,
  ServiceUnavailableError,
  SlotTakenError,
  TooManyBookingsError,
  type BookingFilter,
  type BookingLimits,
  type Store,
} from "./types";

const clone = <T>(value: T): T => structuredClone(value);

/**
 * In-process store. Every mutating method is fully synchronous between its check and its write
 * (no `await` in between), so on a single Node process two concurrent bookings for the last
 * slot can never both succeed.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private businesses = new Map<string, Business>();
  private services = new Map<string, Service>();
  private menu = new Map<string, MenuItem>();
  private bookings = new Map<string, Booking>();

  constructor(options: { seed?: boolean } = {}) {
    if (options.seed ?? true) this.seed();
  }

  private seed() {
    for (const tenant of SEED_TENANTS) {
      const business = this.insertBusiness(tenant.business);
      for (const s of tenant.services) {
        const id = randomUUID();
        this.services.set(id, { ...s, id, businessId: business.id });
      }
      for (const m of tenant.menu) {
        const id = randomUUID();
        this.menu.set(id, { ...m, id, businessId: business.id });
      }
    }
  }

  private insertBusiness(input: NewBusiness): Business {
    for (const b of this.businesses.values()) {
      if (b.slug === input.slug) throw new DuplicateSlugError(input.slug);
    }
    const business: Business = { ...clone(input), id: randomUUID(), createdAt: new Date().toISOString() };
    this.businesses.set(business.id, business);
    return business;
  }

  async listBusinesses() {
    return [...this.businesses.values()].sort((a, b) => a.name.localeCompare(b.name)).map(clone);
  }

  async getBusinessBySlug(slug: string) {
    for (const b of this.businesses.values()) if (b.slug === slug) return clone(b);
    return null;
  }

  async createBusiness(input: NewBusiness) {
    return clone(this.insertBusiness(input));
  }

  async updateBusiness(id: string, patch: Partial<NewBusiness>) {
    const current = this.businesses.get(id);
    if (!current) throw new Error("Business not found");
    if (patch.slug && patch.slug !== current.slug) {
      for (const b of this.businesses.values()) {
        if (b.slug === patch.slug) throw new DuplicateSlugError(patch.slug);
      }
    }
    const next = { ...current, ...clone(patch) };
    this.businesses.set(id, next);
    return clone(next);
  }

  async listServices(businessId: string) {
    return [...this.services.values()]
      .filter((s) => s.businessId === businessId)
      .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
      .map(clone);
  }

  async saveService(input: NewService & { id?: string }) {
    if (input.id) {
      const existing = this.services.get(input.id);
      if (!existing || existing.businessId !== input.businessId) throw new Error("Service not found");
    }
    const id = input.id ?? randomUUID();
    const service: Service = { ...clone(input), id };
    this.services.set(id, service);
    return clone(service);
  }

  async deleteService(businessId: string, id: string) {
    const existing = this.services.get(id);
    if (existing && existing.businessId === businessId) this.services.delete(id);
  }

  async listMenu(businessId: string) {
    return [...this.menu.values()].filter((m) => m.businessId === businessId).map(clone);
  }

  async saveMenuItem(input: NewMenuItem & { id?: string }) {
    if (input.id) {
      const existing = this.menu.get(input.id);
      if (!existing || existing.businessId !== input.businessId) throw new Error("Menu item not found");
    }
    const id = input.id ?? randomUUID();
    const item: MenuItem = { ...clone(input), id };
    this.menu.set(id, item);
    return clone(item);
  }

  async deleteMenuItem(businessId: string, id: string) {
    const existing = this.menu.get(id);
    if (existing && existing.businessId === businessId) this.menu.delete(id);
  }

  async listBookings(businessId: string, filter: BookingFilter = {}) {
    return [...this.bookings.values()]
      .filter((b) => b.businessId === businessId)
      .filter((b) => filter.includeCancelled || b.status === "confirmed")
      .filter((b) => !filter.from || b.date >= filter.from)
      .filter((b) => !filter.to || b.date <= filter.to)
      .sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time))
      .map(clone);
  }

  async createBooking(input: NewBooking, limits: BookingLimits) {
    // Check and insert with no await in between: atomic on one process.
    const active = [...this.bookings.values()].filter(
      (b) => b.businessId === input.businessId && b.status === "confirmed" && b.date >= limits.today,
    );
    // The exact same request again (a host retry): same phone, slot, service and party size.
    const retry = input.customerPhone
      ? active.find(
          (b) =>
            b.date === input.date &&
            b.time === input.time &&
            b.partySize === input.partySize &&
            b.serviceId === input.serviceId &&
            phonesMatch(b.customerPhone, input.customerPhone),
        )
      : undefined;
    if (retry) throw new DuplicateBookingError(retry.reference);
    if (input.serviceId) {
      const svc = this.services.get(input.serviceId);
      if (!svc || svc.businessId !== input.businessId || !svc.active) throw new ServiceUnavailableError();
    }
    if (limits.maxMcpPerHour > 0 && input.source === "mcp") {
      const hourAgo = Date.now() - 3_600_000;
      const recent = [...this.bookings.values()].filter(
        (b) => b.businessId === input.businessId && b.source === "mcp" && Date.parse(b.createdAt) > hourAgo,
      ).length;
      if (recent >= limits.maxMcpPerHour) throw new BookingRateLimitedError();
    }
    if (
      limits.maxActivePerPhone > 0 &&
      active.filter((b) => phonesMatch(b.customerPhone, input.customerPhone)).length >= limits.maxActivePerPhone
    ) {
      throw new TooManyBookingsError();
    }
    const sameDay = active.filter((b) => b.date === input.date);
    if (concurrentBookings(sameDay, input.date, toMinutes(input.time), input.durationMinutes) >= limits.capacity) {
      throw new SlotTakenError();
    }
    const taken = new Set(
      [...this.bookings.values()].filter((b) => b.businessId === input.businessId).map((b) => b.reference),
    );
    let reference = generateReference();
    for (let i = 0; taken.has(reference) && i < 50; i++) reference = generateReference();

    const booking: Booking = {
      ...clone(input),
      id: randomUUID(),
      reference,
      status: "confirmed",
      createdAt: new Date().toISOString(),
    };
    this.bookings.set(booking.id, booking);
    return clone(booking);
  }

  async purgeBookingsBefore(date: string) {
    let n = 0;
    for (const [id, b] of this.bookings) {
      if (b.date < date) {
        this.bookings.delete(id);
        n++;
      }
    }
    return n;
  }

  async cancelBookingById(businessId: string, id: string) {
    const b = this.bookings.get(id);
    if (!b || b.businessId !== businessId || b.status !== "confirmed") return null;
    b.status = "cancelled";
    return clone(b);
  }

  async cancelBooking(businessId: string, reference: string, phone: string, notBefore: { date: string; time: string }) {
    const ref = reference.trim().toUpperCase();
    for (const b of this.bookings.values()) {
      if (b.businessId === businessId && b.reference === ref && isUpcoming(b, notBefore) && phonesMatch(b.customerPhone, phone)) {
        const alreadyCancelled = b.status === "cancelled";
        b.status = "cancelled";
        return { booking: clone(b), alreadyCancelled };
      }
    }
    return null;
  }
}
