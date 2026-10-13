import { describe, expect, it } from "vitest";
import { buildIcs, calendarToken, zonedTimeToUtc } from "@/lib/ics";
import type { Booking } from "@/lib/types";
import { setup } from "./helpers";

describe("calendar feed", () => {
  it("converts Madrid wall time to UTC across the October DST change", () => {
    expect(zonedTimeToUtc("2026-10-24", "21:00", "Europe/Madrid").toISOString()).toBe("2026-10-24T19:00:00.000Z"); // CEST
    expect(zonedTimeToUtc("2026-10-26", "21:00", "Europe/Madrid").toISOString()).toBe("2026-10-26T20:00:00.000Z"); // CET
    expect(zonedTimeToUtc("2026-03-29", "12:00", "Europe/Madrid").toISOString()).toBe("2026-03-29T10:00:00.000Z");
  });

  it("produces a valid, escaped, folded iCalendar document", async () => {
    const { restaurant } = await setup();
    const booking: Booking = {
      id: "b1", businessId: restaurant.id, reference: "K7Q3", date: "2026-10-23", time: "21:00", durationMinutes: 90,
      serviceId: null, serviceName: "Table", partySize: 4, customerName: "Lucía; O'Brien, \\ test",
      customerPhone: "600111222", notes: "Silla de bebé, por favor. ".repeat(6), status: "confirmed", source: "mcp", createdAt: "",
    };
    const cancelled = { ...booking, id: "b2", status: "cancelled" as const };
    const ics = buildIcs(restaurant, [booking, cancelled], new Date("2026-10-20T10:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("DTSTART:20261023T190000Z");
    expect(ics).toContain("DTEND:20261023T203000Z");
    expect(ics).toContain(String.raw`Lucía\; O'Brien\, \\ test`);
    // Control characters (bare CR, NUL…) can't inject lines into the feed.
    const injected = buildIcs(restaurant, [{ ...booking, notes: "hi\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:pwned\u0000" }]);
    expect(injected.split("\r\n").filter((l) => l === "BEGIN:VEVENT" || l.startsWith("SUMMARY:pwned"))).toEqual(["BEGIN:VEVENT"]);
    expect(injected).not.toMatch(/\r(?!\n)/);
    expect(injected).not.toContain("\u0000");
    expect(buildIcs({ ...restaurant, name: "A;B" }, [])).toContain(String.raw`X-WR-CALNAME:A\; B`.replace(" ", ""));
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it("subscription tokens are per business and unguessable", () => {
    expect(calendarToken("la-familia", "s")).not.toBe(calendarToken("el-rancho", "s"));
    expect(calendarToken("la-familia", "s")).not.toBe(calendarToken("la-familia", "t"));
    expect(calendarToken("la-familia", "s")).toHaveLength(32);
  });
});
