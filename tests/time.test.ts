import { describe, expect, it } from "vitest";
import { addDays, isValidDate, normalizeTime, nowInZone, resolveDate, weekdayOf } from "@/lib/time";

describe("normalizeTime", () => {
  it.each([
    ["9:00", "09:00"],
    ["09:00", "09:00"],
    ["9", "09:00"],
    ["9.30", "09:30"],
    ["930", "09:30"],
    ["1730", "17:30"],
    ["5:30 pm", "17:30"],
    ["5:30pm", "17:30"],
    ["5 p.m.", "17:00"],
    ["12 am", "00:00"],
    ["12 pm", "12:00"],
    ["17h", "17:00"],
    ["17h30", "17:30"],
    ["17:00 PM", "17:00"],
    ["9:15AM", "09:15"],
    [" 18:15 ", "18:15"],
  ])("%s → %s", (input, expected) => expect(normalizeTime(input)).toBe(expected));

  it.each(["", "abc", "25:00", "12:60", "9:5", "-1", "99999", "noon", "9:00:00", "1e3"])(
    "rejects %j",
    (input) => expect(normalizeTime(input)).toBeNull(),
  );
});

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDate("2026-02-28")).toBe(true);
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-1-1")).toBe(false);
  });

  it("knows weekdays and month/year rollovers", () => {
    expect(weekdayOf("2026-10-19")).toBe(1); // Monday
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  const today = "2026-10-19"; // Monday
  it.each([
    ["2026-10-20", "2026-10-20"],
    ["today", today],
    ["Hoy", today],
    ["tomorrow", "2026-10-20"],
    ["mañana", "2026-10-20"],
    ["manana", "2026-10-20"],
    ["pasado mañana", "2026-10-21"],
    ["Friday", "2026-10-23"],
    ["next friday", "2026-10-23"],
    ["viernes", "2026-10-23"],
    ["el miércoles", "2026-10-21"],
    ["miercoles", "2026-10-21"],
    ["monday", "2026-10-26"], // same weekday → next week, never today
    ["sábado", "2026-10-24"],
  ])("resolveDate(%j)", (input, expected) => expect(resolveDate(input, today)).toBe(expected));

  it.each(["yesterday", "someday", "2026-02-30", "", "32/10/2026", "DROP TABLE"])("rejects %j", (input) =>
    expect(resolveDate(input, today)).toBeNull(),
  );
});

describe("nowInZone", () => {
  it("handles the end of summer time in Madrid (25 Oct 2026)", () => {
    // 00:30 UTC = 02:30 CEST (still summer time)
    expect(nowInZone("Europe/Madrid", new Date("2026-10-25T00:30:00Z")).time).toBe("02:30");
    // 01:30 UTC = 02:30 CET (after clocks go back at 03:00 → 02:00)
    expect(nowInZone("Europe/Madrid", new Date("2026-10-25T01:30:00Z")).time).toBe("02:30");
    expect(nowInZone("Europe/Madrid", new Date("2026-10-25T12:00:00Z")).time).toBe("13:00");
  });

  it("rolls the local date over at local midnight, not UTC midnight", () => {
    const now = nowInZone("Europe/Madrid", new Date("2026-10-19T22:30:00Z"));
    expect(now.date).toBe("2026-10-20");
    expect(now.time).toBe("00:30");
    expect(now.weekday).toBe(2);
  });
});
