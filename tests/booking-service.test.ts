import { describe, expect, it } from "vitest";
import { MAX_ACTIVE_BOOKINGS_PER_PHONE } from "@/lib/booking-service";
import { setup } from "./helpers";

const customer = { customer_name: "Lucía Pérez", customer_phone: "+34 600 111 222" };

describe("salon booking flow (La Familia)", () => {
  it("books, blocks the slot, and cancels with the right phone only", async () => {
    const { service, salon, store } = await setup();
    const r = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "corte y barba", ...customer });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ref = String(r.booking.reference);
    expect(r.booking.service).toBe("Corte y Barba");
    expect(r.booking.duration_minutes).toBe(45);

    const again = await service.createBooking(salon, {
      date: "2026-10-20",
      time: "11:30", // overlaps 11:00–11:45
      service: "Arreglo de barba",
      customer_name: "Otro",
      customer_phone: "611222333",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.code).toBe("slot_full");
      expect(again.alternatives).toEqual(expect.arrayContaining(["11:45"]));
    }

    expect((await service.cancelBooking(salon, { reference: ref, customer_phone: "699999999" })).ok).toBe(false);
    expect((await service.cancelBooking(salon, { reference: ref.toLowerCase(), customer_phone: "0034600111222" })).ok).toBe(true);
    // A retried cancel (e.g. the host timed out) succeeds again instead of saying "not found".
    const twice = await service.cancelBooking(salon, { reference: ref, customer_phone: "600111222" });
    expect(twice.ok).toBe(true);
    if (twice.ok) expect(twice.message).toMatch(/already cancelled/);
    expect(await store.listBookings(salon.id)).toHaveLength(0);

    const retry = await service.createBooking(salon, { date: "2026-10-20", time: "11:30", service: "Arreglo de barba", customer_name: "Otro", customer_phone: "611222333" });
    expect(retry.ok).toBe(true);
  });

  it("understands relative dates, spoken times and fuzzy service names", async () => {
    const { service, salon } = await setup(); // now: Monday 2026-10-19 08:00
    const r = await service.createBooking(salon, { date: "tomorrow", time: "5:30 pm", service: "corte peinado", ...customer });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.booking.date).toBe("2026-10-20");
      expect(r.booking.time).toBe("17:30");
      expect(r.booking.service).toBe("Corte y Peinado (sin barba)");
    }
  });

  it("asks for clarification instead of guessing", async () => {
    const { service, salon } = await setup();
    const noService = await service.checkAvailability(salon, { date: "2026-10-20" });
    expect(noService.ok).toBe(false);
    if (!noService.ok) expect(noService.code).toBe("service_required");

    const unknown = await service.checkAvailability(salon, { date: "2026-10-20", service: "manicura" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("service_not_found");

    for (const vague of ["corte", "barba"]) {
      const ambiguous = await service.checkAvailability(salon, { date: "2026-10-20", service: vague });
      expect(ambiguous.ok, vague).toBe(false);
      if (!ambiguous.ok) expect(ambiguous.code, vague).toBe("service_ambiguous");
    }

    const badDate = await service.checkAvailability(salon, { date: "someday", service: "Arreglo de barba" });
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.code).toBe("invalid_date");

    const badTime = await service.createBooking(salon, { date: "2026-10-20", time: "noon-ish", service: "Arreglo de barba", ...customer });
    expect(badTime.ok).toBe(false);
    if (!badTime.ok) expect(badTime.code).toBe("invalid_time");
  });

  it("rejects bookings on closed days, in the past, in the lunch gap and running past closing", async () => {
    const { service, salon } = await setup();
    const cases: [string, string, string][] = [
      ["2026-10-24", "10:00", "slot_closed"], // Saturday
      ["2026-10-16", "10:00", "slot_past"],
      ["2026-10-19", "14:15", "slot_outside_hours"], // lunch gap
      ["2026-10-19", "17:45", "slot_outside_hours"], // 45 min → 18:30 > 18:00
      ["2026-10-19", "08:15", "slot_outside_hours"], // before opening
    ];
    for (const [date, time, code] of cases) {
      const r = await service.createBooking(salon, { date, time, service: "Corte y Barba", ...customer });
      expect(r.ok, `${date} ${time}`).toBe(false);
      if (!r.ok) expect(r.code, `${date} ${time}`).toBe(code);
    }
  });

  it("rejects an invalid phone or empty name", async () => {
    const { service, salon } = await setup();
    const phone = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "Arreglo de barba", customer_name: "Ana", customer_phone: "abc-def" });
    expect(phone.ok).toBe(false);
    const name = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "Arreglo de barba", customer_name: "   ", customer_phone: "600111222" });
    expect(name.ok).toBe(false);
  });

  it(`limits one phone number to ${MAX_ACTIVE_BOOKINGS_PER_PHONE} upcoming bookings and blocks exact duplicates`, async () => {
    const { service, salon } = await setup();
    const times = ["09:00", "10:00", "11:00", "12:00"];
    const results = [];
    for (const time of times) {
      results.push(await service.createBooking(salon, { date: "2026-10-21", time, service: "Arreglo de barba", ...customer }));
    }
    expect(results.filter((r) => r.ok)).toHaveLength(MAX_ACTIVE_BOOKINGS_PER_PHONE);
    const last = results.at(-1)!;
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.code).toBe("too_many_bookings");
  });

  it("never returns availability in the past even if the assistant asks for 'today' late in the day", async () => {
    const { service, salon, clock } = await setup();
    clock.set("2026-10-19", "17:40");
    const r = await service.checkAvailability(salon, { date: "today", service: "Corte y Barba" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.available).toBe(false);
      expect((r.next_available as { date: string }[])[0].date).toBe("2026-10-20");
    }
  });
});

describe("restaurant flow (El Rancho)", () => {
  it("requires a party size and enforces the group limit", async () => {
    const { service, restaurant } = await setup();
    const none = await service.checkAvailability(restaurant, { date: "2026-10-21" });
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.code).toBe("party_size_required");

    const big = await service.createBooking(restaurant, { date: "2026-10-21", time: "21:00", party_size: 25, ...customer });
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.code).toBe("party_too_large");
      expect(big.error).toContain(restaurant.phone);
    }

    const ok = await service.createBooking(restaurant, { date: "2026-10-21", time: "21:00", party_size: 4, ...customer });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.booking.party_size).toBe(4);
  });

  it("never invents allergens: unknown is reported as unknown", async () => {
    const { service, restaurant } = await setup();
    const r = await service.checkDish(restaurant, "burger kansas");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dish.name).toBe("Burguer Kansas");
      expect(String(r.dish.allergens)).toMatch(/not published/i);
      expect(String(r.dish.gluten_free)).toMatch(/Not listed/);
    }
    const gf = await service.checkDish(restaurant, "guacamole");
    if (gf.ok) expect(String(gf.dish.gluten_free)).toMatch(/^Yes/);

    const missing = await service.checkDish(restaurant, "paella valenciana");
    expect(missing.ok).toBe(false);
  });

  it("searches the menu accent-insensitively", async () => {
    const { service, restaurant } = await setup();
    const r = await service.getCatalog(restaurant, "ensalada cesar");
    expect(r.type).toBe("menu");
    if (r.type === "menu") expect(r.categories[0].items[0].name).toBe("Ensalada César");
  });

  it("salons don't expose dishes", async () => {
    const { service, salon } = await setup();
    const r = await service.checkDish(salon, "nachos");
    expect(r.ok).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("a booking reference from one business can't cancel anything in another", async () => {
    const { service, salon, restaurant } = await setup();
    const r = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "Arreglo de barba", ...customer });
    if (!r.ok) throw new Error("setup failed");
    const cross = await service.cancelBooking(restaurant, { reference: String(r.booking.reference), customer_phone: customer.customer_phone });
    expect(cross.ok).toBe(false);
  });
});
