/** English versions of the owner's descriptions: stored, returned by the tools, edited in the dashboard. */
import { describe, expect, it } from "vitest";
import { parseBusinessSettings, parseMenuItem, parseNewBusiness, parseService } from "@/lib/forms";
import { SEED_TENANTS } from "@/lib/seed";
import { connectClient, setup } from "./helpers";

type R = { structuredContent?: Record<string, unknown> };
const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("English descriptions", () => {
  it("every demo business, service and dish has one", () => {
    for (const t of SEED_TENANTS) {
      expect(t.business.descriptionEn, t.business.slug).not.toBe("");
      for (const item of [...t.services, ...t.menu]) expect(item.descriptionEn, item.name).not.toBe("");
    }
  });

  it("the tools return them next to the original, and the server introduces itself in English", async () => {
    const { store, clock } = await setup();
    const c = await connectClient("el-rancho", store, clock);
    const dish = ((await c.callTool({ name: "check_dish", arguments: { dish: "guacamole" } })) as R).structuredContent!.dish as Record<string, string>;
    expect(dish.description).toBe("Guacamole con nachos de maíz.");
    expect(dish.description_en).toBe("Guacamole with corn nachos.");
    const info = ((await c.callTool({ name: "get_business_info", arguments: {} })) as R).structuredContent!;
    expect(info.description_en).toMatch(/^Tex-Mex restaurant in Écija/);
    const menu = ((await c.callTool({ name: "get_menu", arguments: { query: "chicken wings" } })) as R).structuredContent!;
    expect(JSON.stringify(menu)).toContain("Chicken wings: barbecue, hot or extra hot.");
    expect(c.getInstructions()).toContain("Tex-Mex restaurant in Écija");
    await c.close();
    const salon = await connectClient("la-familia", store, clock);
    const services = ((await salon.callTool({ name: "get_services", arguments: {} })) as R).structuredContent!.items as Record<string, string>[];
    expect(services.find((s) => s.name === "Corte y Barba")?.description_en).toBe("Haircut and beard trim.");
    await salon.close();
  });

  it("the directory returns them too", async () => {
    const { store, clock } = await setup();
    const c = await connectClient(null, store, clock);
    const r = ((await c.callTool({ name: "find_businesses", arguments: { query: "barbershop" } })) as R).structuredContent!;
    expect((r.businesses as Record<string, string>[])[0].description_en).toMatch(/^Barbershop in Écija/);
    await c.close();
  });

  it("dashboard forms: a sent field is saved, a missing one keeps what's there", () => {
    const svc = parseService(form({ name: "Corte", description: "Corte.", descriptionEn: " Haircut. ", durationMinutes: "30", price: "12" }));
    expect(svc.ok && svc.data.descriptionEn).toBe("Haircut.");
    const noEn = parseService(form({ name: "Corte", description: "", durationMinutes: "30", price: "12" }));
    expect(noEn.ok && noEn.data.descriptionEn).toBeUndefined();
    const dish = parseMenuItem(form({ name: "Tacos", description: "", descriptionEn: "x".repeat(401), price: "5", glutenFree: "unknown" }));
    expect(dish.ok).toBe(false);
    const settings = parseBusinessSettings(form({ name: "Bar", description: "", address: "", phone: "", capacity: "8", slotStepMinutes: "30", tableDurationMinutes: "90", maxPartySize: "8" }), "restaurant");
    expect(settings.ok && "descriptionEn" in settings.data).toBe(false);
    const created = parseNewBusiness(form({ name: "Bar Ñandú", kind: "restaurant", description: "Bar.", address: "", phone: "" }));
    expect(created.ok && created.data.descriptionEn).toBe("");
  });
});
