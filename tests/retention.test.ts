import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/retention/route";
import { setup } from "./helpers";

describe("retention", () => {
  it("purges only bookings before the cutoff", async () => {
    const { store, service, salon } = await setup();
    await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "A", customer_phone: "600111222" });
    expect(await store.purgeBookingsBefore("2026-10-21")).toBe(0);
    expect(await store.purgeBookingsBefore("2026-10-22")).toBe(1);
    expect(await store.listBookings(salon.id, { includeCancelled: true })).toHaveLength(0);
  });

  it("the cron endpoint requires CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request("https://b.test/api/cron/retention"))).status).toBe(401);
    process.env.CRON_SECRET = "c";
    expect((await GET(new Request("https://b.test/api/cron/retention", { headers: { Authorization: "Bearer nope" } }))).status).toBe(401);
    const ok = await GET(new Request("https://b.test/api/cron/retention", { headers: { Authorization: "Bearer c" } }));
    expect(ok.status).toBe(200);
    delete process.env.CRON_SECRET;
  });
});
