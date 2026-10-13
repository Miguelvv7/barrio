/** Regression tests for the second independent review. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as tokenRoute } from "@/app/api/oauth/token/route";
import { GET as calendarRoute } from "@/app/api/calendar/[slug]/[file]/route";
import { maxMcpBookingsPerHour } from "@/lib/booking-service";
import { sendBookingEmails, type Email } from "@/lib/notify";
import { connectClient, setup, textOf } from "./helpers";

describe("email can't be abused", () => {
  it("sandbox (untrusted) businesses never send email; trusted ones do, capped per recipient", async () => {
    const { store, service, salon } = await setup();
    await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "A", customer_phone: "600111222" });
    const booking = (await store.listBookings(salon.id))[0];
    const sent: Email[] = [];
    const send = async (e: Email) => void sent.push(e);
    await sendBookingEmails({ base: "https://b.test", business: { ...salon, trusted: false, notifyEmail: "victim@x.com" }, booking, customerEmail: "victim@x.com" }, send);
    expect(sent).toHaveLength(0);
    for (let i = 0; i < 12; i++) {
      await sendBookingEmails({ base: "https://b.test", business: { ...salon, trusted: true }, booking, customerEmail: "flood-target@x.com" }, send);
    }
    expect(sent.length).toBe(5); // per-recipient cap per hour
  });

  it("booking ceilings: sandboxes get 20/h whatever their capacity; trusted capacity is capped too", () => {
    expect(maxMcpBookingsPerHour({ capacity: 200, trusted: false })).toBe(20);
    expect(maxMcpBookingsPerHour({ capacity: 200, trusted: true })).toBe(120);
    expect(maxMcpBookingsPerHour({ capacity: 8, trusted: true })).toBe(48);
  });
});

describe("cancel can't be brute-forced", () => {
  it("5 wrong references for one phone lock that phone out for a while, even with the right one", async () => {
    const { service, salon } = await setup();
    const r = await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "A", customer_phone: "699555111" });
    if (!r.ok) throw new Error("setup");
    for (let i = 0; i < 5; i++) {
      const bad = await service.cancelBooking(salon, { reference: "ACDE", customer_phone: "699555111" });
      expect(bad.ok).toBe(false);
    }
    const locked = await service.cancelBooking(salon, { reference: String(r.booking.reference), customer_phone: "699555111" });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe("too_many_attempts");
  });
});

describe("hostile text", () => {
  it("control characters are stripped from names and notes at booking time", async () => {
    const { store, service, salon } = await setup();
    await service.createBooking(salon, {
      date: "2026-10-21", time: "10:00", service: "beard trim",
      customer_name: "Ana\r\nX-Header: evil", customer_phone: "600111222", notes: "hi\rEND:VEVENT\u0000\tok",
    });
    const b = (await store.listBookings(salon.id))[0];
    expect(b.customerName).toBe("Ana X-Header: evil");
    expect(b.notes).toBe("hi END:VEVENT ok");
  });
});

describe("no 500s from malformed credentials", () => {
  afterEach(() => {
    for (const k of ["BARRIO_PUBLIC_URL", "BARRIO_OAUTH_CLIENT_ID", "BARRIO_OAUTH_CLIENT_SECRET", "BARRIO_SECRET"]) delete process.env[k];
  });

  it("bad percent-escapes in Basic auth → 401 invalid_client", async () => {
    process.env.BARRIO_PUBLIC_URL = "https://b.test";
    process.env.BARRIO_OAUTH_CLIENT_ID = "alexa";
    process.env.BARRIO_OAUTH_CLIENT_SECRET = "s";
    process.env.BARRIO_SECRET = "k";
    const res = await tokenRoute(
      new Request("https://b.test/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from("a%:b").toString("base64")}` },
        body: "grant_type=client_credentials",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("non-ASCII calendar token of the right length → 404, not a crash", async () => {
    const token = "é".repeat(32);
    const res = await calendarRoute(new Request("https://b.test"), { params: Promise.resolve({ slug: "la-familia", file: `${token}.ics` }) });
    expect(res.status).toBe(404);
  });
});

describe("directory logs every call", () => {
  it("logs unresolved businesses and wrong-type calls", async () => {
    const { store, clock } = await setup();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const c = await connectClient(null, store, clock);
    const r = await c.callTool({ name: "get_menu", arguments: { business: "nope" } });
    expect(textOf(r as { content: unknown }).code).toBe("business_not_found");
    await c.callTool({ name: "get_menu", arguments: { business: "la-familia" } });
    const lines = spy.mock.calls.map((a) => String(a[0])).filter((l) => l.includes('"tool":"get_menu"'));
    spy.mockRestore();
    expect(lines.some((l) => l.includes("business_not_found"))).toBe(true);
    expect(lines.some((l) => l.includes("wrong_type"))).toBe(true);
    await c.close();
  });
});
