/**
 * Alexa+ MCP Toolkit readiness: structured output that matches the declared schema, an MCP App
 * linked from every tool, English aliases for Spanish services, stable ids for chaining.
 */
import { describe, expect, it } from "vitest";
import { APP_URI } from "@/lib/mcp/server";
import { connectClient, setup } from "./helpers";

describe("structured output for Alexa+ visuals", () => {
  it("every tool declares an outputSchema and links the MCP App", async () => {
    const { store, clock } = await setup();
    for (const slug of ["la-familia", "el-rancho"]) {
      const client = await connectClient(slug, store, clock);
      const { tools } = await client.listTools();
      for (const t of tools) {
        expect(t.outputSchema, `${slug}/${t.name}`).toBeDefined();
        const ui = (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui;
        expect(ui?.resourceUri, `${slug}/${t.name}`).toBe(APP_URI);
        expect(t.annotations?.readOnlyHint, t.name).toBe(!["create_booking", "cancel_booking"].includes(t.name));
      }
      await client.close();
    }
  });

  it("results carry structuredContent (validated by the official client) plus text and UI meta", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("el-rancho", store, clock);
    const menu = await client.callTool({ name: "get_menu", arguments: { query: "nachos" } });
    const sc = menu.structuredContent as { view: string; categories: { items: { id: string; price_amount: number }[] }[] };
    expect(sc.view).toBe("menu");
    expect(sc.categories[0].items[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(typeof sc.categories[0].items[0].price_amount).toBe("number");
    expect(JSON.parse((menu.content as { text: string }[])[0].text)).toEqual(sc);
    expect((menu._meta as { ui: { resourceUri: string; invoking: string } }).ui.resourceUri).toBe(APP_URI);

    const booking = await client.callTool({
      name: "create_booking",
      arguments: { date: "2026-10-23", time: "21:00", party_size: 2, customer_name: "Ana", customer_phone: "600111222" },
    });
    const b = booking.structuredContent as { view: string; booking: { reference: string; address: string; weekday: string } };
    expect(b.view).toBe("booking");
    expect(b.booking.address).toContain("Écija");
    expect(b.booking.weekday).toBe("Friday");
    await client.close();
  });

  it("serves the MCP App as a text/html;profile=mcp-app resource, plus a profile resource", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("la-familia", store, clock);
    const { resources } = await client.listResources();
    const app = resources.find((r) => r.uri === APP_URI)!;
    expect(app.mimeType).toBe("text/html;profile=mcp-app");
    const read = await client.readResource({ uri: APP_URI });
    const content = read.contents[0] as { mimeType: string; text: string };
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text.toLowerCase()).toContain("<!doctype html>");
    const profile = await client.readResource({ uri: "barrio://la-familia/profile" });
    expect((profile.contents[0] as { text: string }).text).toContain("Opening hours");
    await client.close();
  });
});

describe("English requests for Spanish-named services", () => {
  it.each([
    ["haircut and beard trim", "Corte y Barba"],
    ["haircut and beard", "Corte y Barba"],
    ["beard trim", "Arreglo de barba"],
    ["shave", "Arreglo de barba"],
    ["haircut", "Corte y Peinado (sin barba)"],
    ["hair design", "Corte + Hair Design (dibujo)"],
  ])("%j → %s", async (spoken, expected) => {
    const { service, salon } = await setup();
    const r = await service.checkAvailability(salon, { date: "2026-10-21", service: spoken });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.service).toBe(expected);
  });

  it("service ids returned by get_services can be passed back (stable identifiers for chaining)", async () => {
    const { service, salon } = await setup();
    const catalog = await service.getCatalog(salon);
    if (catalog.type !== "services") throw new Error("expected services");
    const id = catalog.items.find((s) => s.name === "Arreglo de barba")!.id;
    const r = await service.createBooking(salon, { date: "2026-10-21", time: "10:00", service: id, customer_name: "Ana", customer_phone: "600111222" });
    expect(r.ok).toBe(true);
  });
});
