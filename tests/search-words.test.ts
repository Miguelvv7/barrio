/**
 * Words customers say that once tripped the matcher: an inherited object key, a service named for
 * what it is NOT, and the Spanish word for a dish whose name is written the English way.
 */
import { describe, expect, it } from "vitest";
import { matchScore } from "@/lib/text";
import { connectClient, setup, textOf } from "./helpers";

type R = { structuredContent?: Record<string, unknown>; isError?: boolean; content: unknown };

describe("search words", () => {
  it("'constructor' and other object keys are just words, on every tool that searches", async () => {
    const { store, clock } = await setup();
    const dir = await connectClient(null, store, clock);
    for (const [name, args] of [
      ["find_businesses", { query: "constructor" }],
      ["find_businesses", { query: "hasOwnProperty __proto__ toString" }],
      ["check_dish", { business: "el-rancho", dish: "constructor" }],
      ["get_services", { business: "la-familia", query: "constructor" }],
      ["get_business_info", { business: "constructor" }],
    ] as const) {
      const r = (await dir.callTool({ name, arguments: args })) as R;
      const code = r.isError ? textOf(r).code : "ok";
      expect(code, `${name} ${JSON.stringify(args)}`).not.toBe("unavailable");
    }
    await dir.close();
  });

  it("'barba' never matches a service 'sin barba'; 'corte sin barba' does", () => {
    expect(matchScore("barba", "Corte y Peinado (sin barba)")).toBe(0);
    expect(matchScore("beard", "Corte y Peinado (sin barba)")).toBe(0);
    expect(matchScore("corte sin barba", "Corte y Peinado (sin barba)")).toBeGreaterThan(matchScore("corte sin barba", "Corte y Barba"));
    expect(matchScore("barba", "Arreglo de barba")).toBeGreaterThan(0.5);
    // What the customer doesn't want rules a name out, aliases included.
    expect(matchScore("without beard", "Arreglo de barba")).toBe(0);
    expect(matchScore("without beard", "beard")).toBe(0);
    expect(matchScore("corte sin barba", "Corte y Barba")).toBe(0);
    expect(matchScore("without beard", "Corte y Peinado (sin barba)")).toBeGreaterThan(0);
  });

  it("translations stretch to a plural, not to a look-alike word", () => {
    expect(matchScore("soda", "Refrescos")).toBeGreaterThan(0);
    expect(matchScore("burger", "Hamburguesas")).toBeGreaterThan(0);
    expect(matchScore("patatas", "Fried Jalapeños")).toBe(0);
    expect(matchScore("burgr", "Burguer Kansas")).toBe(0);
    expect(matchScore("burguer", "Burger Kansas")).toBeGreaterThan(0);
  });

  it("'hamburguesa' finds the burgers, like 'burger' does", async () => {
    expect(matchScore("hamburguesa", "Burguer Kansas")).toBeGreaterThan(0);
    const { store, clock } = await setup();
    const shop = await connectClient("el-rancho", store, clock);
    const es = (await shop.callTool({ name: "check_dish", arguments: { dish: "hamburguesa" } })) as R;
    const en = (await shop.callTool({ name: "check_dish", arguments: { dish: "burger" } })) as R;
    expect(textOf(es).code).toBe("dish_ambiguous");
    expect(textOf(es).options).toEqual(textOf(en).options);
    await shop.close();
  });
});

describe("initials on the public demo dashboard", () => {
  it("shows whole letters only", async () => {
    const { initials } = await import("@/lib/text");
    expect(initials("José García")).toBe("J. G.");
    expect(initials("José 🌮 محمد")).toBe("J. م.");
    expect(initials("ángel")).toBe("Á.");
    expect(initials("🌮")).toBe("—");
    expect(initials("  ")).toBe("—");
  });
});
