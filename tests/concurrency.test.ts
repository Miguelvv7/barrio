/**
 * "100 people at once." The invariant that matters: no matter how requests interleave,
 * a slot never holds more bookings than the business's capacity.
 */
import { describe, expect, it } from "vitest";
import { toMinutes } from "@/lib/time";
import type { Booking } from "@/lib/types";
import { connectClient, setup, textOf } from "./helpers";

function maxOverlap(bookings: Booking[]): number {
  let max = 0;
  for (const b of bookings) {
    const t = toMinutes(b.time);
    const overlapping = bookings.filter(
      (o) => o.date === b.date && toMinutes(o.time) < t + 1 && t < toMinutes(o.time) + o.durationMinutes,
    ).length;
    max = Math.max(max, overlapping);
  }
  return max;
}

const phone = (i: number) => `6${String(10_000_000 + i).padStart(8, "0")}`;

describe("100 simultaneous customers", () => {
  it("La Familia: 100 people want Tuesday 11:00 → exactly 1 gets it, 99 get alternatives", async () => {
    const { service, salon, store } = await setup();
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        service.createBooking(salon, {
          date: "2026-10-20",
          time: "11:00",
          service: "Corte y Barba",
          customer_name: `Cliente ${i}`,
          customer_phone: phone(i),
        }),
      ),
    );
    const wins = results.filter((r) => r.ok);
    expect(wins).toHaveLength(1);
    for (const r of results.filter((r) => !r.ok)) {
      if (r.ok) continue;
      expect(["slot_taken", "slot_full"]).toContain(r.code);
      expect((r.alternatives as string[]).length).toBeGreaterThan(0);
      expect(r.alternatives).not.toContain("11:00");
    }
    expect(await store.listBookings(salon.id)).toHaveLength(1);
  });

  it("El Rancho: 100 tables requested for Friday 21:00 → exactly 8 (capacity) succeed", async () => {
    const { service, restaurant, store } = await setup();
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        service.createBooking(restaurant, {
          date: "2026-10-23",
          time: "21:00",
          party_size: 1 + (i % 6),
          customer_name: `Mesa ${i}`,
          customer_phone: phone(i),
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(restaurant.capacity);
    expect(await store.listBookings(restaurant.id)).toHaveLength(restaurant.capacity);
  });

  it("chaos: 100 customers × random days/times/services never overbook, and every reference is unique", async () => {
    const { service, salon, store } = await setup();
    const services = ["Corte y Barba", "Arreglo de barba", "Corte y Peinado (sin barba)", "Corte + Hair Design (dibujo)"];
    const days = ["2026-10-19", "2026-10-20", "2026-10-21"];
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const times = Array.from({ length: 40 }, (_, i) => `${String(9 + Math.floor(i / 4)).padStart(2, "0")}:${["00", "15", "30", "45"][i % 4]}`);

    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        service.createBooking(salon, {
          date: pick(days),
          time: pick(times),
          service: pick(services),
          customer_name: `C${i}`,
          customer_phone: phone(i % 40), // some customers book several times
        }),
      ),
    );
    const bookings = await store.listBookings(salon.id);
    expect(bookings.length).toBe(results.filter((r) => r.ok).length);
    expect(maxOverlap(bookings)).toBeLessThanOrEqual(salon.capacity);
    expect(new Set(bookings.map((b) => b.reference)).size).toBe(bookings.length);
    const perPhone = new Map<string, number>();
    for (const b of bookings) perPhone.set(b.customerPhone, (perPhone.get(b.customerPhone) ?? 0) + 1);
    expect(Math.max(...perPhone.values())).toBeLessThanOrEqual(3);
  });

  it("same phone hammering create_booking 50× in parallel still gets at most 3 bookings", async () => {
    const { service, salon, store } = await setup();
    const times = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "14:30"];
    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        service.createBooking(salon, {
          date: "2026-10-21",
          time: times[i % times.length],
          service: "Arreglo de barba",
          customer_name: "Spammer",
          customer_phone: "+34 699 000 000",
        }),
      ),
    );
    expect(await store.listBookings(salon.id)).toHaveLength(3);
  });

  it("100 concurrent MCP clients over the real protocol: handshake + tools/list + a booking race", async () => {
    const { store, clock } = await setup();
    const clients = await Promise.all(Array.from({ length: 100 }, () => connectClient("la-familia", store, clock)));
    const lists = await Promise.all(clients.map((c) => c.listTools()));
    for (const l of lists) expect(l.tools.map((t) => t.name)).toContain("create_booking");

    const calls = await Promise.all(
      clients.map((c, i) =>
        c.callTool({
          name: "create_booking",
          arguments: {
            date: "2026-10-22",
            time: "16:00",
            service: "Arreglo de barba",
            customer_name: `Cliente ${i}`,
            customer_phone: phone(i),
          },
        }),
      ),
    );
    const ok = calls.filter((c) => !c.isError);
    expect(ok).toHaveLength(1);
    expect(textOf(ok[0] as { content: unknown }).booking.reference).toMatch(/^[A-Z0-9]{4}$/);
    await Promise.all(clients.map((c) => c.close()));
  });
});
