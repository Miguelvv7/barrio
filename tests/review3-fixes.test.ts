/** Third review round: each test reproduces a bug found by the review before it was fixed. */
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issuePageToken, verifyPageToken } from "@/lib/auth";
import { ConfigError } from "@/lib/env";
import { parseBusinessSettings, parseService } from "@/lib/forms";
import { getStore, setStoreForTesting } from "@/lib/store";
import { connectClient, setup } from "./helpers";

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


describe("services keep what customers call them", () => {
  const base = { name: "Arreglo de barba", description: "", durationMinutes: "15", price: "8", active: "on" };
  it("a form without the aliases field leaves them alone (undefined), one with it replaces them", () => {
    const without = parseService(form(base));
    expect(without.ok && without.data.aliases).toBeUndefined();
    const withField = parseService(form({ ...base, aliases: "beard trim, Beard trim , x, beard shave" }));
    expect(withField.ok && withField.data.aliases).toEqual(["beard trim", "Beard trim", "beard shave"]);
    const cleared = parseService(form({ ...base, aliases: "" }));
    expect(cleared.ok && cleared.data.aliases).toEqual([]);
  });
});

describe("production refuses unsafe configuration instead of failing later", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setStoreForTesting(undefined);
  });

  it("signing never uses the admin password, and Vercel production needs BARRIO_SECRET", async () => {
    vi.stubEnv("BARRIO_SECRET", "");
    vi.stubEnv("BARRIO_ADMIN_PASSWORD", "Barrio2026");
    const [exp, sig] = issuePageToken("la-familia").split(".");
    // What an attacker would test offline against a public token: the password as the HMAC key.
    const guess = createHmac("sha256", "Barrio2026").update(`try:la-familia:${exp}`).digest("base64url");
    expect(sig).not.toBe(guess);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => issuePageToken("la-familia")).toThrow(ConfigError);
    vi.stubEnv("BARRIO_SECRET", "s".repeat(64));
    expect(verifyPageToken("la-familia", issuePageToken("la-familia"))).toBe(true);
  });

  it("Vercel production without Supabase fails loudly instead of keeping bookings per instance", () => {
    setStoreForTesting(undefined);
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getStore()).toThrow(ConfigError);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getStore().kind).toBe("memory");
  });
});

describe("tool inputs a voice model actually sends", () => {
  it("party_size as a string still books, on the business server and the directory, and stays a number in the schema", async () => {
    const { store, clock } = await setup();
    for (const slug of ["el-rancho", null]) {
      const c = await connectClient(slug, store, clock);
      const { tools } = await c.listTools();
      const avail = tools.find((t) => t.name === "check_availability")!;
      expect((avail.inputSchema.properties as Record<string, { type?: string }>).party_size.type).toBe("integer");
      const r = (await c.callTool({
        name: "check_availability",
        arguments: { ...(slug ? {} : { business: "el-rancho" }), date: "2026-10-23", party_size: "2" },
      })) as { isError?: boolean };
      expect(r.isError).toBeFalsy();
      await c.close();
    }
  });
});
