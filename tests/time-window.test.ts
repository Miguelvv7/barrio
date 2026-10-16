/**
 * "Anything free after five?" — the server narrows the free times, so the assistant never filters a
 * long list itself (a live run once offered 15:30 to a customer who asked for after five).
 */
import { describe, expect, it } from "vitest";
import { connectClient, setup, textOf } from "./helpers";

type Avail = { available: boolean; start_times?: string[]; time_window?: { after?: string; before?: string }; other_times_that_day?: string[]; next_available?: { date: string; first_time: string }[] };
type R = { structuredContent?: Avail; isError?: boolean; content: unknown };

const FRIDAY = "2026-10-23"; // La Familia 10:30–14:30, 15:30–18:00 · El Rancho 12:00–16:00, 19:00–23:30

describe("check_availability with a time window", () => {
  it("'after five' at the barber: only start times from 17:00, however the time is written", async () => {
    const { service, salon } = await setup();
    for (const after of ["17:00", "5 pm", "5", "5:00", "five pm"]) {
      const r = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba", after });
      expect(r.ok, after).toBe(true);
      if (!r.ok) continue;
      const times = r.start_times as string[];
      expect(times.length, after).toBeGreaterThan(0);
      expect(times.every((t) => t >= "17:00"), `${after}: ${times}`).toBe(true);
      expect(r.time_window, after).toEqual({ after: "17:00" });
    }
  });

  it("a bare hour stays in the morning when the shop is open then", async () => {
    const { service, salon, restaurant } = await setup();
    // 11 at the barber is 11 am (open since 10:30)…
    const barber = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba", after: "11" });
    expect(barber.ok && barber.time_window).toEqual({ after: "11:00" });
    // …8 at the barber can't be 8 pm (closed by then), so it stays 8 am: the whole day…
    const early = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba", after: "8" });
    expect(early.ok && early.time_window).toEqual({ after: "08:00" });
    // …and 8 at a restaurant open until 23:30 is 8 pm.
    const dinner = await service.checkAvailability(restaurant, { date: FRIDAY, party_size: 2, after: "8" });
    expect(dinner.ok && dinner.time_window).toEqual({ after: "20:00" });
    expect(dinner.ok && (dinner.start_times as string[]).every((t) => t >= "20:00")).toBe(true);
  });

  it("'before two' at the restaurant: lunch times only; both bounds together make a range", async () => {
    const { service, restaurant } = await setup();
    const lunch = await service.checkAvailability(restaurant, { date: FRIDAY, party_size: 2, before: "2" });
    expect(lunch.ok && lunch.time_window).toEqual({ before: "14:00" });
    expect(lunch.ok && (lunch.start_times as string[]).every((t) => t < "14:00")).toBe(true);
    const range = await service.checkAvailability(restaurant, { date: FRIDAY, party_size: 2, after: "20:00", before: "21:00" });
    expect(range.ok && range.start_times).toEqual(["20:00", "20:30"]);
  });

  it("nothing in the window: says so, offers the closest times that day and the next days in that window", async () => {
    const { service, salon } = await setup();
    // Corte y Barba takes 45 minutes and Friday closes at 18:00: the last start is 17:15.
    const r = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba", after: "17:30" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.available).toBe(false);
    expect(String(r.message)).toMatch(/from 17:30/);
    expect(r.other_times_that_day).toContain("17:15");
    const next = r.next_available as { date: string; first_time: string }[];
    expect(next.length).toBeGreaterThan(0);
    expect(next.every((n) => n.first_time >= "17:30")).toBe(true);
  });

  it("refuses times it can't read, and empty windows", async () => {
    const { service, salon } = await setup();
    const bad = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba", after: "teatime" });
    expect(!bad.ok && bad.code).toBe("invalid_time");
    const empty = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba", after: "18:00", before: "17:00" });
    expect(!empty.ok && empty.code).toBe("invalid_time");
  });

  it("without a window nothing changes", async () => {
    const { service, salon } = await setup();
    const r = await service.checkAvailability(salon, { date: FRIDAY, service: "Corte y Barba" });
    expect(r.ok && "time_window" in r).toBe(false);
    expect(r.ok && (r.start_times as string[])[0]).toBe("10:30");
  });

  it("over MCP (per business and directory), the result matches the declared outputSchema", async () => {
    const { store, clock } = await setup();
    const shop = await connectClient("la-familia", store, clock);
    const tools = (await shop.listTools()).tools;
    const props = tools.find((t) => t.name === "check_availability")!.inputSchema.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["after", "before"]));
    // The official client validates structuredContent against outputSchema: a mismatch throws here.
    const r = (await shop.callTool({ name: "check_availability", arguments: { date: FRIDAY, service: "beard trim", after: "5 pm" } })) as R;
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.start_times!.every((t) => t >= "17:00")).toBe(true);
    const none = (await shop.callTool({ name: "check_availability", arguments: { date: FRIDAY, service: "Corte y Barba", after: "17:30" } })) as R;
    expect(none.structuredContent!.available).toBe(false);
    const bad = (await shop.callTool({ name: "check_availability", arguments: { date: FRIDAY, service: "Corte y Barba", after: "teatime" } })) as R;
    expect(bad.isError).toBe(true);
    expect(textOf(bad).code).toBe("invalid_time");
    await shop.close();

    const dir = await connectClient(null, store, clock);
    const d = (await dir.callTool({ name: "check_availability", arguments: { business: "el-rancho", date: FRIDAY, party_size: 4, after: "21:00" } })) as R;
    expect(d.structuredContent!.start_times!.every((t) => t >= "21:00")).toBe(true);
    await dir.close();
  });
});
