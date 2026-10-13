/** Third review round: each test reproduces a bug found by the review before it was fixed. */
import { describe, expect, it } from "vitest";
import { parseBusinessSettings } from "@/lib/forms";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const settings = { name: "La Familia", description: "Barbería", address: "Calle 1", phone: "600111222", timezone: "Europe/Madrid", currency: "EUR", slotStepMinutes: "15", notifyEmail: "" };

describe("owner dashboard settings", () => {
  it("a salon can save its settings (the form has no restaurant-only fields)", () => {
    const r = parseBusinessSettings(form({ ...settings, capacity: "2" }), "salon");
    expect(r).toMatchObject({ ok: true, data: { capacity: 2 } });
    if (r.ok) expect(r.data).not.toHaveProperty("maxPartySize");
  });

  it("a restaurant still has to send its table time and largest group", () => {
    expect(parseBusinessSettings(form({ ...settings, capacity: "8" }), "restaurant").ok).toBe(false);
    const r = parseBusinessSettings(form({ ...settings, capacity: "8", tableDurationMinutes: "90", maxPartySize: "10" }), "restaurant");
    expect(r).toMatchObject({ ok: true, data: { tableDurationMinutes: 90, maxPartySize: 10 } });
  });
});
