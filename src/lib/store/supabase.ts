import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { phonesMatch } from "../phone";
import { toMinutes } from "../time";
import type {
  Booking,
  Business,
  MenuItem,
  NewBooking,
  NewBusiness,
  NewMenuItem,
  NewService,
  OpeningInterval,
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

type Row = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" ? v : Number(v));

function toBusiness(r: Row): Business {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    kind: r.kind as Business["kind"],
    description: String(r.description ?? ""),
    address: String(r.address ?? ""),
    phone: String(r.phone ?? ""),
    timezone: String(r.timezone),
    currency: String(r.currency),
    capacity: num(r.capacity),
    slotStepMinutes: num(r.slot_step_minutes),
    tableDurationMinutes: num(r.table_duration_minutes),
    maxPartySize: num(r.max_party_size),
    hours: (r.hours as OpeningInterval[]) ?? [],
    notifyEmail: String(r.notify_email ?? ""),
    trusted: Boolean(r.trusted),
    createdAt: String(r.created_at),
  };
}

function fromBusiness(b: Partial<NewBusiness>): Row {
  const row: Row = {};
  if (b.slug !== undefined) row.slug = b.slug;
  if (b.name !== undefined) row.name = b.name;
  if (b.kind !== undefined) row.kind = b.kind;
  if (b.description !== undefined) row.description = b.description;
  if (b.address !== undefined) row.address = b.address;
  if (b.phone !== undefined) row.phone = b.phone;
  if (b.timezone !== undefined) row.timezone = b.timezone;
  if (b.currency !== undefined) row.currency = b.currency;
  if (b.capacity !== undefined) row.capacity = b.capacity;
  if (b.slotStepMinutes !== undefined) row.slot_step_minutes = b.slotStepMinutes;
  if (b.tableDurationMinutes !== undefined) row.table_duration_minutes = b.tableDurationMinutes;
  if (b.maxPartySize !== undefined) row.max_party_size = b.maxPartySize;
  if (b.hours !== undefined) row.hours = b.hours;
  if (b.notifyEmail !== undefined) row.notify_email = b.notifyEmail;
  if (b.trusted !== undefined) row.trusted = b.trusted;
  return row;
}

function toService(r: Row): Service {
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    name: String(r.name),
    description: String(r.description ?? ""),
    durationMinutes: num(r.duration_minutes),
    price: num(r.price),
    priceFrom: Boolean(r.price_from),
    active: Boolean(r.active),
    aliases: (r.aliases as string[]) ?? [],
  };
}

function toMenuItem(r: Row): MenuItem {
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    category: String(r.category ?? ""),
    name: String(r.name),
    description: String(r.description ?? ""),
    price: num(r.price),
    glutenFree: r.gluten_free === null || r.gluten_free === undefined ? null : Boolean(r.gluten_free),
    allergens: (r.allergens as string[]) ?? [],
    allergensDeclared: Boolean(r.allergens_declared),
    available: Boolean(r.available),
  };
}

function toBooking(r: Row): Booking {
  return {
    id: String(r.id),
    businessId: String(r.business_id),
    reference: String(r.reference),
    date: String(r.date).slice(0, 10),
    time: String(r.start_time).slice(0, 5),
    durationMinutes: num(r.duration_minutes),
    serviceId: r.service_id ? String(r.service_id) : null,
    serviceName: String(r.service_name ?? ""),
    partySize: num(r.party_size),
    customerName: String(r.customer_name),
    customerPhone: String(r.customer_phone),
    notes: String(r.notes ?? ""),
    status: r.status as Booking["status"],
    source: r.source as Booking["source"],
    createdAt: String(r.created_at),
  };
}

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/** Production store. Uses the service-role key; must only ever run on the server. */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async listBusinesses() {
    const { data, error } = await this.db.from("businesses").select("*").order("name");
    if (error) fail("listBusinesses", error);
    // Sorted here too: the database's collation may differ from the in-memory store's.
    return (data ?? []).map(toBusiness).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getBusinessBySlug(slug: string) {
    const { data, error } = await this.db.from("businesses").select("*").eq("slug", slug).maybeSingle();
    if (error) fail("getBusinessBySlug", error);
    return data ? toBusiness(data) : null;
  }

  async createBusiness(input: NewBusiness) {
    const { data, error } = await this.db.from("businesses").insert(fromBusiness(input)).select("*").single();
    if (error?.code === "23505") throw new DuplicateSlugError(input.slug);
    if (error) fail("createBusiness", error);
    return toBusiness(data);
  }

  async updateBusiness(id: string, patch: Partial<NewBusiness>) {
    const { data, error } = await this.db
      .from("businesses")
      .update(fromBusiness(patch))
      .eq("id", id)
      .select("*")
      .single();
    if (error?.code === "23505" && patch.slug) throw new DuplicateSlugError(patch.slug);
    if (error) fail("updateBusiness", error);
    return toBusiness(data);
  }

  async listServices(businessId: string) {
    const { data, error } = await this.db
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .order("price")
      .order("name");
    if (error) fail("listServices", error);
    return (data ?? []).map(toService).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  }

  async saveService(input: NewService & { id?: string }) {
    const row = {
      business_id: input.businessId,
      name: input.name,
      description: input.description,
      duration_minutes: input.durationMinutes,
      price: input.price,
      price_from: input.priceFrom,
      active: input.active,
      aliases: input.aliases,
    };
    const query = input.id
      ? this.db.from("services").update(row).eq("id", input.id).eq("business_id", input.businessId)
      : this.db.from("services").insert(row);
    const { data, error } = await query.select("*").single();
    if (error) fail("saveService", error);
    return toService(data);
  }

  async deleteService(businessId: string, id: string) {
    const { error } = await this.db.from("services").delete().eq("id", id).eq("business_id", businessId);
    if (error) fail("deleteService", error);
  }

  async listMenu(businessId: string) {
    const { data, error } = await this.db
      .from("menu_items")
      .select("*")
      .eq("business_id", businessId)
      .order("seq");
    if (error) fail("listMenu", error);
    return (data ?? []).map(toMenuItem);
  }

  async saveMenuItem(input: NewMenuItem & { id?: string }) {
    const row = {
      business_id: input.businessId,
      category: input.category,
      name: input.name,
      description: input.description,
      price: input.price,
      gluten_free: input.glutenFree,
      allergens: input.allergens,
      allergens_declared: input.allergensDeclared,
      available: input.available,
    };
    const query = input.id
      ? this.db.from("menu_items").update(row).eq("id", input.id).eq("business_id", input.businessId)
      : this.db.from("menu_items").insert(row);
    const { data, error } = await query.select("*").single();
    if (error) fail("saveMenuItem", error);
    return toMenuItem(data);
  }

  async deleteMenuItem(businessId: string, id: string) {
    const { error } = await this.db.from("menu_items").delete().eq("id", id).eq("business_id", businessId);
    if (error) fail("deleteMenuItem", error);
  }

  async listBookings(businessId: string, filter: BookingFilter = {}) {
    // PostgREST returns at most 1000 rows per request: page through, or a busy restaurant's agenda,
    // calendar feed and availability checks would silently miss bookings.
    const PAGE = 1000;
    const rows: Row[] = [];
    for (let offset = 0; offset < 50_000; offset += PAGE) {
      let query = this.db.from("bookings").select("*").eq("business_id", businessId);
      if (!filter.includeCancelled) query = query.eq("status", "confirmed");
      if (filter.from) query = query.gte("date", filter.from);
      if (filter.to) query = query.lte("date", filter.to);
      const { data, error } = await query.order("date").order("start_time").order("id").range(offset, offset + PAGE - 1);
      if (error) fail("listBookings", error);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < PAGE) break;
    }
    return rows.map(toBooking).sort((a, b) => a.date.localeCompare(b.date) || toMinutes(a.time) - toMinutes(b.time));
  }

  /**
   * Enforced inside Postgres (create_booking_atomic): capacity comes from the stored business row,
   * the per-phone limit and "today" from `limits`.
   */
  async createBooking(input: NewBooking, limits: BookingLimits) {
    const { data, error } = await this.db.rpc("create_booking_atomic", {
      p_max_per_phone: limits.maxActivePerPhone,
      p_max_mcp_per_hour: limits.maxMcpPerHour,
      p_today: limits.today,
      p_business_id: input.businessId,
      p_date: input.date,
      p_start_time: input.time,
      p_duration_minutes: input.durationMinutes,
      p_service_id: input.serviceId,
      p_service_name: input.serviceName,
      p_party_size: input.partySize,
      p_customer_name: input.customerName,
      p_customer_phone: input.customerPhone,
      p_notes: input.notes,
      p_source: input.source,
    });
    const duplicate = /DUPLICATE_BOOKING:([A-Z0-9]{4,8})/.exec(error?.message ?? "");
    if (duplicate) throw new DuplicateBookingError(duplicate[1]);
    if (error?.message?.includes("SERVICE_UNAVAILABLE")) throw new ServiceUnavailableError();
    if (error?.message?.includes("SLOT_TAKEN")) throw new SlotTakenError();
    if (error?.message?.includes("TOO_MANY_BOOKINGS")) throw new TooManyBookingsError();
    if (error?.message?.includes("RATE_LIMITED")) throw new BookingRateLimitedError();
    if (error) fail("createBooking", error);
    return toBooking(data as Row);
  }

  async purgeBookingsBefore(date: string) {
    const { data, error } = await this.db.from("bookings").delete().lt("date", date).select("id");
    if (error) fail("purgeBookingsBefore", error);
    return (data ?? []).length;
  }

  async cancelBookingById(businessId: string, id: string) {
    const { data, error } = await this.db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("business_id", businessId)
      .eq("status", "confirmed")
      .select("*")
      .maybeSingle();
    if (error) fail("cancelBookingById", error);
    return data ? toBooking(data) : null;
  }

  async cancelBooking(businessId: string, reference: string, phone: string, notBefore: { date: string; time: string }) {
    const { data, error } = await this.db
      .from("bookings")
      .select("*")
      .eq("business_id", businessId)
      .gte("date", notBefore.date)
      .eq("reference", reference.trim().toUpperCase())
      .maybeSingle();
    if (error) fail("cancelBooking", error);
    if (!data || !phonesMatch(String(data.customer_phone), phone) || !isUpcoming(toBooking(data), notBefore)) return null;
    if (data.status === "cancelled") return { booking: toBooking(data), alreadyCancelled: true };
    const { data: updated, error: updateError } = await this.db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "confirmed")
      .select("*")
      .maybeSingle();
    if (updateError) fail("cancelBooking", updateError);
    // Lost a race with another cancel of the same booking: it's cancelled either way.
    const booking: Booking = updated ? toBooking(updated) : { ...toBooking(data), status: "cancelled" };
    return { booking, alreadyCancelled: !updated };
  }
}
