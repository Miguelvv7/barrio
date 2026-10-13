/** One MCP server (one Alexa+ add-on) in front of every business. */
import { describe, expect, it } from "vitest";
import { connectClient, setup, textOf } from "./helpers";

type R = { content: unknown; isError?: boolean; structuredContent?: unknown };

describe("directory server", () => {
  it("lists every tool with a `business` argument, plus find_businesses", async () => {
    const { store, clock } = await setup();
    const c = await connectClient(null, store, clock);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "cancel_booking", "check_availability", "check_dish", "create_booking", "find_businesses", "get_business_info", "get_menu", "get_services",
    ]);
    for (const t of tools.filter((t) => t.name !== "find_businesses")) expect(t.inputSchema.required).toContain("business");
    const init = c.getServerVersion();
    expect(init?.name).toBe("barrio");
    await c.close();
  });

  it("finds businesses by need, in English or Spanish", async () => {
    const { store, clock } = await setup();
    const c = await connectClient(null, store, clock);
    const find = async (query?: string) =>
      ((await c.callTool({ name: "find_businesses", arguments: query ? { query } : {} })) as R).structuredContent as { businesses: { id: string }[] };
    expect((await find()).businesses.map((b) => b.id).sort()).toEqual(["el-rancho", "la-familia"]);
    expect((await find("barber")).businesses.map((b) => b.id)).toEqual(["la-familia"]);
    expect((await find("I need a haircut")).businesses.map((b) => b.id)).toEqual(["la-familia"]);
    expect((await find("tacos")).businesses.map((b) => b.id)).toEqual(["el-rancho"]);
    expect((await find("restaurante para cenar")).businesses.map((b) => b.id)).toEqual(["el-rancho"]);
    await c.close();
  });

  it("books end to end by business name, and guards against the wrong tool for the type", async () => {
    const { store, clock } = await setup();
    const c = await connectClient(null, store, clock);
    const wrong = (await c.callTool({ name: "get_menu", arguments: { business: "la familia" } })) as R;
    expect(wrong.isError).toBe(true);
    expect(textOf(wrong).code).toBe("wrong_type");
    const unknown = (await c.callTool({ name: "get_services", arguments: { business: "Burger King" } })) as R;
    expect(textOf(unknown).code).toBe("business_not_found");

    const booked = (await c.callTool({
      name: "create_booking",
      arguments: { business: "Peluquería La Familia", date: "2026-10-21", time: "10:00", service: "beard trim", customer_name: "Ana", customer_phone: "600111222" },
    })) as R;
    expect(booked.isError).toBeFalsy();
    const ref = (booked.structuredContent as { booking: { reference: string } }).booking.reference;
    const table = (await c.callTool({
      name: "create_booking",
      arguments: { business: "el-rancho", date: "2026-10-23", time: "21:00", party_size: 2, customer_name: "Ana", customer_phone: "600111222" },
    })) as R;
    expect(table.isError).toBeFalsy();
    const cancel = (await c.callTool({ name: "cancel_booking", arguments: { business: "la-familia", reference: ref, customer_phone: "600111222" } })) as R;
    expect(cancel.isError).toBeFalsy();
    // A La Familia reference can't cancel at El Rancho.
    const cross = (await c.callTool({ name: "cancel_booking", arguments: { business: "el-rancho", reference: ref, customer_phone: "600111222" } })) as R;
    expect(cross.isError).toBe(true);
    await c.close();
  });
});
