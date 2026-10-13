import { describe, expect, it } from "vitest";
import { BookingService } from "@/lib/booking-service";
import { customerEmail, ownerEmail, sendBookingEmails, type Email } from "@/lib/notify";
import { fixedClock, setup } from "./helpers";

describe("booking emails", () => {
  it("assistant bookings trigger the hook (with the customer email); owner bookings don't", async () => {
    const { store, salon } = await setup();
    const events: unknown[] = [];
    const svc = new BookingService(store, fixedClock(), { onBooked: (e) => events.push(e) });
    const r = await svc.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "Ana", customer_phone: "600111222", customer_email: "ana@example.com" });
    expect(r.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect((events[0] as { customerEmail: string }).customerEmail).toBe("ana@example.com");
    await svc.createBooking(salon, { date: "2026-10-21", time: "11:00", service: "beard trim", customer_name: "Walk-in", customer_phone: "" }, "dashboard");
    expect(events).toHaveLength(1);
    const bad = await svc.createBooking(salon, { date: "2026-10-21", time: "12:00", service: "beard trim", customer_name: "Ana", customer_phone: "600111333", customer_email: "not an email" });
    expect(bad.ok).toBe(false);
  });

  it("a throwing hook never breaks the booking", async () => {
    const { store, salon } = await setup();
    const svc = new BookingService(store, fixedClock(), { onBooked: () => { throw new Error("smtp down"); } });
    const r = await svc.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "Ana", customer_phone: "600111222" });
    expect(r.ok).toBe(true);
  });

  it("customer email has everything the Alexa+ guide asks for, escaped", async () => {
    const { store, restaurant } = await setup();
    const svc = new BookingService(store, fixedClock());
    const r = await svc.createBooking(restaurant, { date: "2026-10-23", time: "21:00", party_size: 4, customer_name: "<b>Lucía</b>", customer_phone: "600111222" });
    if (!r.ok) throw new Error("setup");
    const booking = (await store.listBookings(restaurant.id))[0];
    const e = customerEmail("https://barrio.test", restaurant, booking, "l@example.com");
    expect(e.html).toContain(booking.reference);
    expect(e.html).toContain("Friday 2026-10-23, 21:00");
    expect(e.html).toContain(restaurant.address.split(",")[0]);
    expect(e.html).toContain(restaurant.phone);
    expect(e.html).toContain(`https://barrio.test/cancel/el-rancho?ref=${booking.reference}`);
    expect(e.html).not.toContain("<b>Lucía</b>");
    expect(e.html).toContain("&lt;b&gt;Lucía&lt;/b&gt;");
    const o = ownerEmail("https://barrio.test", { ...restaurant, notifyEmail: "owner@example.com" }, booking);
    expect(o.to).toBe("owner@example.com");
    expect(o.subject).toContain("Mesa para 4");
  });

  it("sends only what applies and survives sender failures", async () => {
    const { store, salon } = await setup();
    const svc = new BookingService(store, fixedClock());
    await svc.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "Ana", customer_phone: "600111222" });
    const booking = (await store.listBookings(salon.id))[0];
    const sent: Email[] = [];
    await sendBookingEmails({ base: "https://b.test", business: salon, booking }, async (e) => void sent.push(e));
    expect(sent).toHaveLength(0);
    await sendBookingEmails({ base: "https://b.test", business: { ...salon, notifyEmail: "o@x.com" }, booking, customerEmail: "c@x.com" }, async (e) => void sent.push(e));
    expect(sent.map((e) => e.to).sort()).toEqual(["c@x.com", "o@x.com"]);
    await expect(
      sendBookingEmails({ base: "https://b.test", business: { ...salon, notifyEmail: "o@x.com" }, booking }, async () => { throw new Error("down"); }),
    ).resolves.toBeUndefined();
  });
});
