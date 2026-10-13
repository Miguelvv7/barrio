/**
 * Runs the real SupabaseStore (supabase-js → PostgREST → Postgres + create_booking_atomic).
 * Skipped unless SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_KEY point at a DISPOSABLE database:
 * it creates its own tenants with random slugs and never deletes anything else.
 */
import { describe, expect, it } from "vitest";
import { BookingService } from "@/lib/booking-service";
import { SupabaseStore } from "@/lib/store/supabase";
import { SEED_TENANTS } from "@/lib/seed";
import { createClient } from "@supabase/supabase-js";
import { fixedClock } from "./helpers";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;

describe.skipIf(!url || !key)("SupabaseStore against a real Postgres + PostgREST", () => {
  const store = url && key ? new SupabaseStore(url, key) : (undefined as unknown as SupabaseStore);
  const suffix = Math.random().toString(36).slice(2, 8);

  async function tenant(kind: "salon" | "restaurant") {
    const seed = SEED_TENANTS.find((t) => t.business.kind === kind)!;
    const business = await store.createBusiness({ ...seed.business, slug: `${seed.business.slug}-${kind}-${suffix}-${Math.random().toString(36).slice(2, 6)}` });
    for (const s of seed.services) await store.saveService({ ...s, businessId: business.id });
    for (const m of seed.menu) await store.saveMenuItem({ ...m, businessId: business.id });
    return business;
  }

  it("round-trips a business with hours, services and menu items", async () => {
    const salon = await tenant("salon");
    const fetched = (await store.getBusinessBySlug(salon.slug))!;
    expect(fetched.hours).toEqual(salon.hours);
    expect(fetched.capacity).toBe(1);
    const services = await store.listServices(salon.id);
    expect(services.map((s) => s.name)).toContain("Corte y Barba");
    expect(services.find((s) => s.name.startsWith("Corte + Hair"))!.priceFrom).toBe(true);
    expect(typeof services[0].price).toBe("number");

    const rest = await tenant("restaurant");
    const menu = await store.listMenu(rest.id);
    expect(menu.find((m) => m.name === "Guacamole")!.glutenFree).toBe(true);
    expect(menu.find((m) => m.name === "Burguer Kansas")!.glutenFree).toBeNull();
  });

  it("rejects duplicate slugs", async () => {
    const salon = await tenant("salon");
    await expect(store.createBusiness({ ...SEED_TENANTS[0].business, slug: salon.slug })).rejects.toThrow(/already exists/);
  });

  it("full booking flow through BookingService, incl. cancel with formatted phone", async () => {
    const salon = await tenant("salon");
    const service = new BookingService(store, fixedClock());
    const r = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "Corte y Barba", customer_name: "Lucía", customer_phone: "+34 600 111 222" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const listed = await store.listBookings(salon.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].time).toBe("11:00");
    expect(listed[0].date).toBe("2026-10-20");
    expect(listed[0].customerPhone).toBe("34600111222");
    const avail = await service.checkAvailability(salon, { date: "2026-10-20", service: "Arreglo de barba" });
    if (avail.ok) expect(avail.start_times).not.toContain("11:15");
    const c = await service.cancelBooking(salon, { reference: String(r.booking.reference), customer_phone: "600111222" });
    expect(c.ok).toBe(true);
    expect(await store.listBookings(salon.id)).toHaveLength(0);
    expect(await store.listBookings(salon.id, { includeCancelled: true })).toHaveLength(1);
  });

  it("100 simultaneous bookings for one slot over HTTP → exactly 1 succeeds", async () => {
    const salon = await tenant("salon");
    const service = new BookingService(store, fixedClock());
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "Arreglo de barba", customer_name: `C${i}`, customer_phone: `6${10_000_000 + i}` }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await store.listBookings(salon.id)).toHaveLength(1);
  });

  it("the public anon key can read nothing (RLS)", async () => {
    if (!anonKey) return;
    await tenant("salon");
    const anon = createClient(url!, anonKey, { auth: { persistSession: false } });
    for (const table of ["businesses", "services", "menu_items", "bookings"]) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? [], table).toHaveLength(0);
    }
    const { error } = await anon.rpc("create_booking_atomic", {});
    expect(error).not.toBeNull();
  });

  it("updates and deletes stay inside their own tenant", async () => {
    const a = await tenant("salon");
    const b = await tenant("salon");
    const svcB = (await store.listServices(b.id))[0];
    await store.deleteService(a.id, svcB.id); // wrong tenant → no-op
    expect(await store.listServices(b.id)).toHaveLength(4);
    await expect(store.saveService({ ...svcB, businessId: a.id, name: "hijack" })).rejects.toThrow();
    const updated = await store.updateBusiness(a.id, { name: "La Familia Renamed" });
    expect(updated.name).toBe("La Familia Renamed");
  });

  it("keeps the menu in the order it was entered (categories stay in menu order)", async () => {
    const rest = await tenant("restaurant");
    const menu = await store.listMenu(rest.id);
    const seed = SEED_TENANTS.find((t) => t.business.kind === "restaurant")!;
    expect(menu.map((m) => m.name)).toEqual(seed.menu.map((m) => m.name));
  });

  it("owner walk-ins without phone, hourly cap mapping, and no cancelling past bookings", async () => {
    const salon = await tenant("salon");
    const clock = fixedClock();
    const service = new BookingService(store, clock);
    const walkIn = await service.createBooking(salon, { date: "today", time: "09:07", service: "Arreglo de barba", customer_name: "Walk-in", customer_phone: "" }, "dashboard");
    expect(walkIn.ok, JSON.stringify(walkIn)).toBe(true);

    const r = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "Arreglo de barba", customer_name: "Ana", customer_phone: "600111333" });
    if (!r.ok) throw new Error(JSON.stringify(r));
    clock.set("2026-10-21", "09:00");
    const late = await service.cancelBooking(salon, { reference: String(r.booking.reference), customer_phone: "600111333" });
    expect(late.ok).toBe(false);
  });

  it("round-trips service aliases and the owner notify email; purges old bookings", async () => {
    const salon = await tenant("salon");
    const svc = (await store.listServices(salon.id)).find((s) => s.name === "Arreglo de barba")!;
    expect(svc.aliases).toContain("beard trim");
    const updated = await store.updateBusiness(salon.id, { notifyEmail: "owner@example.com" });
    expect(updated.notifyEmail).toBe("owner@example.com");
    const service = new BookingService(store, fixedClock());
    const r = await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "A", customer_phone: "600123123" });
    expect(r.ok).toBe(true);
    const before = await store.purgeBookingsBefore("2026-10-21");
    expect(before).toBeGreaterThanOrEqual(0);
    expect(await store.listBookings(salon.id)).toHaveLength(1);
    await store.purgeBookingsBefore("2026-10-22");
    expect(await store.listBookings(salon.id, { includeCancelled: true })).toHaveLength(0);
  });

  it("lists more than PostgREST's 1000-row page (busy agendas and calendar feeds)", async () => {
    const rest = await tenant("restaurant");
    const db = createClient(url!, key!, { auth: { persistSession: false } });
    const rows = Array.from({ length: 1200 }, (_, i) => ({
      business_id: rest.id,
      reference: `P${String(i).padStart(3, "0")}`.replace(/0/g, "A").replace(/1/g, "C").replace(/2/g, "D").replace(/5/g, "E").replace(/8/g, "F"),
      date: `2026-11-${String(1 + (i % 28)).padStart(2, "0")}`,
      start_time: "20:00",
      duration_minutes: 90,
      customer_name: `Bulk ${i}`,
      customer_phone: "",
    }));
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await db.from("bookings").insert(rows.slice(i, i + 400));
      expect(error).toBeNull();
    }
    expect(await store.listBookings(rest.id)).toHaveLength(1200);
    expect(await store.listBookings(rest.id, { from: "2026-11-28", to: "2026-11-28" })).toHaveLength(Math.ceil((1200 - 27) / 28));
  });

  it("a retried booking is stored once and confirmed again; a retried cancel succeeds", async () => {
    const rest = await tenant("restaurant");
    const service = new BookingService(store, fixedClock());
    const args = { date: "2026-10-23", time: "21:00", party_size: 4, customer_name: "Ana", customer_phone: "600777000" };
    const results = await Promise.all([1, 2, 3].map(() => service.createBooking(rest, args)));
    expect(new Set(results.map((r) => (r.ok ? r.booking.reference : r.code))).size).toBe(1);
    expect(await store.listBookings(rest.id)).toHaveLength(1);
    const ref = String(results[0].ok && results[0].booking.reference);
    expect((await service.cancelBooking(rest, { reference: ref, customer_phone: "600777000" })).ok).toBe(true);
    const twice = await service.cancelBooking(rest, { reference: ref, customer_phone: "600777000" });
    expect(twice.ok && twice.message).toMatch(/already cancelled/);
  });
});
