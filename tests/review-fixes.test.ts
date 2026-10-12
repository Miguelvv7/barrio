/** Regression tests for the issues found in the independent review. */
import { describe, expect, it } from "vitest";
import { issuePageToken, verifyPageToken } from "@/lib/auth";
import { maxMcpBookingsPerHour } from "@/lib/booking-service";
import { safeNext } from "@/lib/safe-next";
import { setup } from "./helpers";

const customer = { customer_name: "Ana", customer_phone: "600111222" };

describe("check_dish never silently picks between several dishes", () => {
  it("'ensalada' → asks which one (César isn't gluten-free, the mixta is)", async () => {
    const { service, restaurant } = await setup();
    const r = await service.checkDish(restaurant, "ensalada");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("dish_ambiguous");
      expect(r.options).toEqual(expect.arrayContaining(["Ensalada César", "Ensalada mixta de la casa"]));
    }
  });

  it("one-letter queries match nothing instead of a random dish", async () => {
    const { service, restaurant } = await setup();
    for (const q of ["a", "e", "ñ", "  "]) expect((await service.checkDish(restaurant, q)).ok, q).toBe(false);
  });

  it("specific names still resolve", async () => {
    const { service, restaurant } = await setup();
    for (const [q, name] of [["ensalada cesar", "Ensalada César"], ["ensalada mixta", "Ensalada mixta de la casa"], ["silverado", "Silverado"]]) {
      const r = await service.checkDish(restaurant, q);
      expect(r.ok, q).toBe(true);
      if (r.ok) expect(r.dish.name).toBe(name);
    }
  });
});

describe("booking grid and owner overrides", () => {
  it("assistant bookings must start on the grid; nearest grid times are offered", async () => {
    const { service, salon } = await setup();
    const r = await service.createBooking(salon, { date: "2026-10-21", time: "10:07", service: "Arreglo de barba", ...customer });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("slot_off_grid");
      expect(r.alternatives).toEqual(expect.arrayContaining(["10:00", "10:15"]));
    }
  });

  it("grid is relative to each shift's opening (Tuesday opens 10:30, afternoon 15:30)", async () => {
    const { service, salon } = await setup();
    const ok = await service.createBooking(salon, { date: "2026-10-20", time: "15:45", service: "Arreglo de barba", ...customer });
    expect(ok.ok).toBe(true);
  });

  it("the owner can add a walk-in right now, off-grid, without a phone, beyond the per-phone limit", async () => {
    const { service, salon, clock } = await setup();
    clock.set("2026-10-21", "10:05");
    const walkIn = await service.createBooking(salon, { date: "today", time: "10:07", service: "Arreglo de barba", customer_name: "Walk-in", customer_phone: "" }, "dashboard");
    expect(walkIn.ok, JSON.stringify(walkIn)).toBe(true);
    for (const time of ["11:00", "11:30", "12:00", "12:30"]) {
      const r = await service.createBooking(salon, { date: "today", time, service: "Arreglo de barba", customer_name: "Tienda", customer_phone: "674887500" }, "dashboard");
      expect(r.ok, time).toBe(true);
    }
    // …but never on top of another booking, and never in the past days.
    const clash = await service.createBooking(salon, { date: "today", time: "10:10", service: "Arreglo de barba", customer_name: "X", customer_phone: "" }, "dashboard");
    expect(clash.ok).toBe(false);
    const past = await service.createBooking(salon, { date: "2026-10-20", time: "11:00", service: "Arreglo de barba", customer_name: "X", customer_phone: "" }, "dashboard");
    expect(past.ok).toBe(false);
  });

  it("assistant bookings still require a phone", async () => {
    const { service, salon } = await setup();
    const r = await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "Arreglo de barba", customer_name: "A", customer_phone: "" });
    expect(r.ok).toBe(false);
  });
});

describe("calendar flooding", () => {
  it(`caps assistant bookings per business per hour (La Familia: ${maxMcpBookingsPerHour({ capacity: 1 })})`, async () => {
    const { service, salon } = await setup();
    const cap = maxMcpBookingsPerHour(salon);
    const days = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28"];
    const times = ["10:30", "11:00", "11:30", "12:00", "12:30", "13:00"];
    const results = [];
    let i = 0;
    for (const date of days) for (const time of times) results.push(await service.createBooking(salon, { date, time, service: "Arreglo de barba", customer_name: `F${i}`, customer_phone: `69${String(1_000_000 + i++)}` }));
    expect(results.filter((r) => r.ok)).toHaveLength(cap);
    const blocked = results.find((r) => !r.ok);
    if (blocked && !blocked.ok) {
      expect(blocked.code).toBe("rate_limited");
      expect(blocked.error).toContain(salon.phone);
    }
    // The owner can still add bookings.
    const owner = await service.createBooking(salon, { date: "2026-10-28", time: "09:00", service: "Arreglo de barba", customer_name: "Owner", customer_phone: "" }, "dashboard");
    expect(owner.ok).toBe(true);
  });
});

describe("input hardening", () => {
  it("rejects 0, negative, fractional and NaN party sizes", async () => {
    const { service, restaurant } = await setup();
    for (const party_size of [0, -2, 2.5, Number.NaN]) {
      const r = await service.createBooking(restaurant, { date: "2026-10-23", time: "21:00", party_size, ...customer }, "dashboard");
      expect(r.ok, String(party_size)).toBe(false);
    }
  });

  it("past bookings can't be cancelled by customers", async () => {
    const { service, salon, clock } = await setup();
    const r = await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "Arreglo de barba", ...customer });
    if (!r.ok) throw new Error("setup");
    clock.set("2026-10-22", "09:00");
    const c = await service.cancelBooking(salon, { reference: String(r.booking.reference), customer_phone: customer.customer_phone });
    expect(c.ok).toBe(false);
  });
});

describe("login redirect", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/dashboard/la-familia", "/dashboard/la-familia"],
    ["/dashboard/la-familia#agenda", "/dashboard/la-familia#agenda"],
    ["//evil.com", "/dashboard"],
    ["/\\evil.com", "/dashboard"],
    ["/\tevil.com", "/dashboard"],
    ["/dashboard\\@evil.com", "/dashboard"],
    ["https://evil.com", "/dashboard"],
    ["/dashboard/../../evil", "/evil"],
    ["javascript:alert(1)", "/dashboard"],
    ["", "/dashboard"],
  ])("%j → %j", (input, expected) => {
    const out = safeNext(input);
    expect(out.startsWith("/") && !out.startsWith("//")).toBe(true);
    if (expected !== "/evil") expect(out).toBe(expected);
  });
});

describe("assistant page token", () => {
  it("is bound to the business and expires", () => {
    const now = 1_800_000_000_000;
    const t = issuePageToken("la-familia", now);
    expect(verifyPageToken("la-familia", t, now + 1000)).toBe(true);
    expect(verifyPageToken("el-rancho", t, now + 1000)).toBe(false);
    expect(verifyPageToken("la-familia", t, now + 3 * 3600_000)).toBe(false);
    expect(verifyPageToken("la-familia", `${now + 1000}.forged`, now)).toBe(false);
    expect(verifyPageToken("la-familia", null, now)).toBe(false);
    expect(verifyPageToken("la-familia", `${now + 10 * 3600_000}.${t.split(".")[1]}`, now)).toBe(false);
  });
});
