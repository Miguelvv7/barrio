/** Third review round: each test reproduces a bug found by the review before it was fixed. */
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issuePageToken, verifyPageToken } from "@/lib/auth";
import { ConfigError } from "@/lib/env";
import { nearestSlots } from "@/lib/availability";
import { parseBusinessSettings, parseMenuItem, parseService } from "@/lib/forms";
import { phonesMatch } from "@/lib/phone";
import { couldBeAfternoon, normalizeTime, resolveDate } from "@/lib/time";
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

describe("allergen answers are about the dish the customer asked for", () => {
  it.each(["quesadilla with guacamole", "tacos with guacamole", "fajitas with guacamole", "kansas burger with guacamole"])(
    "%j never answers \"Guacamole: gluten-free yes\"",
    async (spoken) => {
      const { service, restaurant } = await setup();
      const r = await service.checkDish(restaurant, spoken);
      if (r.ok) expect(r.dish.name).not.toBe("Guacamole");
      else expect(r.code).toBe("dish_ambiguous");
    },
  );

  it("still answers plain questions about one dish, filler words and all", async () => {
    const { service, restaurant } = await setup();
    for (const spoken of ["guacamole", "is the guacamole gluten free", "Burguer Kansas", "burger kansas"]) {
      const r = await service.checkDish(restaurant, spoken);
      expect(r.ok, `${spoken}: ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it("asking the menu for gluten-free options lists the dishes flagged gluten-free", async () => {
    const { service, restaurant, store } = await setup();
    const flagged = (await store.listMenu(restaurant.id)).filter((m) => m.available && m.glutenFree === true).length;
    expect(flagged).toBeGreaterThan(5);
    for (const q of ["gluten free", "gluten-free options", "sin gluten", "celiac", "anything for coeliacs?"]) {
      const menu = await service.getCatalog(restaurant, q);
      const items = "categories" in menu && menu.categories ? menu.categories.flatMap((c) => c.items) : [];
      expect(items.length, q).toBe(flagged);
      expect(items.every((i) => i.gluten_free)).toBe(true);
    }
    // Both filters apply: gluten-free AND about nachos (by name or description).
    const nachos = await service.getCatalog(restaurant, "gluten free nachos");
    const found = "categories" in nachos && nachos.categories ? nachos.categories.flatMap((c) => c.items) : [];
    expect(found.some((i) => /nachos/i.test(i.name))).toBe(true);
    expect(found.every((i) => i.gluten_free && /nachos/i.test(`${i.name} ${i.description}`))).toBe(true);
  });

  it("the dashboard refuses a dish that is both gluten-free and declares gluten", () => {
    const f = form({ category: "Pan", name: "Pan", description: "", price: "2", glutenFree: "yes", allergensDeclared: "on", available: "on" });
    f.append("allergens", "gluten");
    expect(parseMenuItem(f)).toMatchObject({ ok: false, error: expect.stringMatching(/gluten-free and contain gluten/) });
    f.set("glutenFree", "unknown");
    expect(parseMenuItem(f).ok).toBe(true);
  });

  it("a dish marked gluten-free that also declares gluten is never a \"yes\"", async () => {
    const { service, restaurant, store } = await setup();
    await store.saveMenuItem({
      businessId: restaurant.id, category: "Test", name: "Pan de la casa", description: "", price: 2,
      glutenFree: true, allergens: ["gluten"], allergensDeclared: true, available: true,
    });
    const r = await service.checkDish(restaurant, "pan de la casa");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dish.is_gluten_free).toBe(false);
      expect(String(r.dish.gluten_free)).toMatch(/ask the staff/i);
    }
  });
});

describe("services are matched on everything the customer said", () => {
  it.each([
    ["corte de pelo y barba", "Corte y Peinado (sin barba)"],
    ["corte de pelo con barba", "Corte y Peinado (sin barba)"],
    ["beard and design", "Arreglo de barba"],
  ])("%j is not silently booked as %s", async (spoken, wrong) => {
    const { service, salon } = await setup();
    const r = await service.checkAvailability(salon, { date: "2026-10-20", service: spoken });
    if (r.ok) expect(r.service).not.toBe(wrong);
    else expect(r.code).toBe("service_ambiguous");
  });

  it("filler words don't make a clear request ambiguous", async () => {
    const { service, salon } = await setup();
    const r = await service.checkAvailability(salon, { date: "2026-10-20", service: "I'd like a beard trim please" });
    expect(r.ok && r.service).toBe("Arreglo de barba");
  });
});

describe("dates and times the way people (and voice models) say them", () => {
  it.each([
    ["noon", "12:00"],
    ["half past five pm", "17:30"],
    ["half past 5", "05:30"],
    ["quarter to eight pm", "19:45"],
    ["17:30 h", "17:30"],
    ["a las 17:30", "17:30"],
    ["at 5:30 pm", "17:30"],
    ["9:30.", "09:30"],
  ])("time %j → %s", (input, expected) => expect(normalizeTime(input)).toBe(expected));

  it.each([
    ["tonight", "2026-10-19"],
    ["esta noche", "2026-10-19"],
    ["for tomorrow", "2026-10-20"],
    ["para mañana", "2026-10-20"],
    ["Friday.", "2026-10-23"],
    ["2026-11-20T19:00:00", "2026-11-20"],
  ])("date %j → %s (today is Monday 2026-10-19)", (input, expected) => expect(resolveDate(input, "2026-10-19")).toBe(expected));

  it("knows when an hour could be the afternoon", () => {
    for (const t of ["8:30", "5", "7.15", "a las 8:30"]) expect(couldBeAfternoon(t), t).toBe(true);
    for (const t of ["08:30", "20:30", "8:30 am", "8:30pm", "12:00", "half past five"]) expect(couldBeAfternoon(t), t).toBe(false);
  });

  it("\"8:30\" at the restaurant books dinner, not a closed 08:30", async () => {
    const { service, restaurant } = await setup();
    const r = await service.createBooking(restaurant, {
      date: "2026-10-23", time: "8:30", party_size: 2, customer_name: "Ana", customer_phone: "600123987",
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.booking.time).toBe("20:30");
  });

  it("alternatives cross a split shift: 17:00 offers dinner too", () => {
    const lunch = ["13:00", "13:30", "14:00", "14:30", "15:00"];
    const dinner = ["20:00", "20:30", "21:00"];
    expect(nearestSlots([...lunch, ...dinner], "17:00")).toEqual(["14:30", "15:00", "20:00"]);
    expect(nearestSlots(["09:00", "10:00", "11:00", "12:00", "17:00"], "10:40")).toEqual(["10:00", "11:00", "12:00"]);
  });

  it("US numbers that differ only in the area code are different customers", () => {
    expect(phonesMatch("+1 212 555 0100", "+1 312 555 0100")).toBe(false);
    expect(phonesMatch("+1 212 555 0100", "(212) 555-0100")).toBe(true);
    expect(phonesMatch("+34 674 88 75 00", "674887500")).toBe(true);
    expect(phonesMatch("0034674887500", "+34674887500")).toBe(true);
  });
});

describe("a judge in the US, in the evening (already tomorrow in Spain)", () => {
  it("asking for their own 'today' gets today at the business as an option, and says which day it is there", async () => {
    // Business-local now: Tuesday 2026-10-20 at 01:30 — US Pacific is still Monday evening.
    const { service, salon, clock } = await setup();
    clock.set("2026-10-20", "01:30");
    const r = await service.checkAvailability(salon, { date: "2026-10-19", service: "beard trim" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.available).toBe(false);
      expect(String(r.message)).toContain("Tuesday 2026-10-20");
      expect((r.next_available as { date: string }[])[0].date).toBe("2026-10-20");
    }
  });
});
