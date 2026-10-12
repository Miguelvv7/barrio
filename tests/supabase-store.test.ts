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
  const store = new SupabaseStore(url!, key!);
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
});
