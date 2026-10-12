import { describe, expect, it } from "vitest";
import { availableSlots, checkSlot, generateReference, nearestSlots, summarizeSlots } from "@/lib/availability";
import type { Booking } from "@/lib/types";
import { fixedClock, setup } from "./helpers";

function booking(partial: Partial<Booking>): Booking {
  return {
    id: crypto.randomUUID(),
    businessId: "b",
    reference: "AAAA",
    date: "2026-10-19",
    time: "10:00",
    durationMinutes: 30,
    serviceId: null,
    serviceName: "x",
    partySize: 1,
    customerName: "x",
    customerPhone: "600000000",
    notes: "",
    status: "confirmed",
    source: "mcp",
    createdAt: "",
    ...partial,
  };
}

describe("availableSlots — La Familia (capacity 1, 15-min grid)", async () => {
  const { salon } = await setup();
  const now = fixedClock().now("Europe/Madrid"); // Monday 2026-10-19 08:00

  it("never lets a 45-min service run past the lunch break or closing time", () => {
    const slots = availableSlots({ business: salon, date: "2026-10-19", durationMinutes: 45, bookings: [], now });
    expect(slots[0]).toBe("09:00");
    expect(slots).toContain("13:15"); // ends 14:00 exactly
    expect(slots).not.toContain("13:30"); // would end 14:15, inside the break
    expect(slots).not.toContain("14:15");
    expect(slots).toContain("14:30");
    expect(slots.at(-1)).toBe("17:15"); // ends 18:00 exactly
    expect(slots).toHaveLength(30);
  });

  it("is closed on Saturday and Sunday", () => {
    expect(availableSlots({ business: salon, date: "2026-10-24", durationMinutes: 30, bookings: [], now })).toEqual([]);
    expect(availableSlots({ business: salon, date: "2026-10-25", durationMinutes: 30, bookings: [], now })).toEqual([]);
    expect(checkSlot({ business: salon, date: "2026-10-24", durationMinutes: 30, bookings: [], now }, "10:30")).toBe("closed");
  });

  it("blocks overlapping times around an existing booking, but not adjacent ones", () => {
    const bookings = [booking({ time: "10:00", durationMinutes: 30 })];
    const slots = availableSlots({ business: salon, date: "2026-10-19", durationMinutes: 30, bookings, now });
    expect(slots).not.toContain("09:45"); // 09:45–10:15 overlaps
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:15");
    expect(slots).toContain("09:30"); // ends 10:00 — touching is fine
    expect(slots).toContain("10:30"); // starts when the other ends
  });

  it("ignores cancelled bookings and other days", () => {
    const bookings = [
      booking({ time: "10:00", status: "cancelled" }),
      booking({ time: "11:00", date: "2026-10-20" }),
    ];
    const slots = availableSlots({ business: salon, date: "2026-10-19", durationMinutes: 30, bookings, now });
    expect(slots).toContain("10:00");
    expect(slots).toContain("11:00");
  });

  it("requires 30 minutes' notice today and rejects the past and far future", () => {
    const at1000 = { ...now, time: "10:00", minutes: 600 };
    const q = { business: salon, date: "2026-10-19", durationMinutes: 30, bookings: [], now: at1000 };
    expect(checkSlot(q, "10:15")).toBe("too_soon");
    expect(checkSlot(q, "10:30")).toBeNull();
    expect(availableSlots(q)[0]).toBe("10:30");
    expect(checkSlot({ ...q, date: "2026-10-16" }, "10:30")).toBe("past");
    expect(checkSlot({ ...q, date: "2026-12-19" }, "10:30")).toBe("too_far");
    expect(checkSlot({ ...q, date: "2026-12-18" }, "10:30")).toBeNull(); // exactly 60 days
  });
});

describe("availableSlots — El Rancho (capacity 8 tables, 90-min tables)", async () => {
  const { restaurant } = await setup();
  const now = fixedClock().now("Europe/Madrid");

  it("allows up to 8 overlapping tables, then blocks", () => {
    const date = "2026-10-21"; // Wednesday
    const seven = Array.from({ length: 7 }, () => booking({ date, time: "20:00", durationMinutes: 90 }));
    const q = { business: restaurant, date, durationMinutes: 90, bookings: seven, now };
    expect(checkSlot(q, "20:00")).toBeNull();
    const eight = [...seven, booking({ date, time: "20:00", durationMinutes: 90 })];
    expect(checkSlot({ ...q, bookings: eight }, "20:00")).toBe("full");
    expect(checkSlot({ ...q, bookings: eight }, "21:00")).toBe("full"); // 21:00 overlaps 20:00–21:30
    expect(checkSlot({ ...q, bookings: eight }, "21:30")).toBeNull(); // starts when they leave
    expect(checkSlot({ ...q, bookings: eight }, "22:30")).toBe("outside_hours"); // table would run past 23:30
  });

  it("is closed on Mondays (placeholder hours)", () => {
    expect(checkSlot({ business: restaurant, date: "2026-10-19", durationMinutes: 90, bookings: [], now }, "21:00")).toBe("closed");
  });
});

describe("helpers", () => {
  it("summarizes slots into speakable ranges", () => {
    expect(summarizeSlots(["09:00", "09:15", "09:30", "11:00", "14:30", "14:45"], 15)).toEqual([
      "09:00–09:30",
      "11:00",
      "14:30–14:45",
    ]);
    expect(summarizeSlots([], 15)).toEqual([]);
    expect(summarizeSlots(["10:00"], 15)).toEqual(["10:00"]);
  });

  it("offers the nearest alternatives in time order", () => {
    expect(nearestSlots(["09:00", "10:00", "11:00", "12:00", "17:00"], "10:40")).toEqual(["10:00", "11:00", "12:00"]);
  });

  it("generates readable 4-char references with no ambiguous characters", () => {
    for (let i = 0; i < 2000; i++) {
      const ref = generateReference();
      expect(ref).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{4}$/);
    }
    expect(generateReference(() => 0.999999)).toHaveLength(4);
  });
});
