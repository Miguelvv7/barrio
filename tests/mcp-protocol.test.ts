/** Spec compliance of the Streamable HTTP endpoint (MCP 2025-11-25) and the tool surface. */
import { afterEach, describe, expect, it } from "vitest";
import { handleMcpRequest, isAllowedOrigin, MAX_BODY_BYTES } from "@/lib/mcp/handler";
import { connectClient, rpc, setup, textOf } from "./helpers";

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } },
};

async function call(slug: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  const { store, clock } = await setup();
  const res = await handleMcpRequest(rpc(slug, body, headers, method), slug, { store, clock });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { res, text, json: json as Record<string, unknown> };
}

describe("lifecycle", () => {
  it("negotiates protocol 2025-11-25 and advertises tools + instructions", async () => {
    const { res, json } = await call("la-familia", INIT);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const result = json.result as Record<string, unknown>;
    expect(result.protocolVersion).toBe("2025-11-25");
    expect((result.capabilities as Record<string, unknown>).tools).toBeDefined();
    expect((result.serverInfo as Record<string, unknown>).name).toBe("barrio-la-familia");
    expect(String(result.instructions)).toContain("Peluquería La Familia");
    expect(res.headers.get("mcp-session-id")).toBeNull(); // stateless
  });

  it("falls back to its latest version when a client asks for an unknown one", async () => {
    const { json } = await call("la-familia", { ...INIT, params: { ...INIT.params, protocolVersion: "1999-01-01" } });
    expect((json.result as Record<string, unknown>).protocolVersion).toBe("2025-11-25");
  });

  it("accepts older clients (2025-06-18, 2025-03-26)", async () => {
    for (const v of ["2025-06-18", "2025-03-26"]) {
      const { json } = await call("la-familia", { ...INIT, params: { ...INIT.params, protocolVersion: v } });
      expect((json.result as Record<string, unknown>).protocolVersion).toBe(v);
    }
  });

  it("answers notifications with 202 and no body", async () => {
    const { res, text } = await call("la-familia", { jsonrpc: "2.0", method: "notifications/initialized" }, { "MCP-Protocol-Version": "2025-11-25" });
    expect(res.status).toBe(202);
    expect(text).toBe("");
  });

  it("answers ping", async () => {
    const { json } = await call("la-familia", { jsonrpc: "2.0", id: 9, method: "ping" }, { "MCP-Protocol-Version": "2025-11-25" });
    expect(json.result).toEqual({});
  });
});

describe("tool surface per tenant type", () => {
  it("salon exposes services + booking tools, not menu tools", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("la-familia", store, clock);
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["cancel_booking", "check_availability", "create_booking", "get_business_info", "get_services"]);
    await client.close();
  });

  it("restaurant exposes menu + allergen tools", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("el-rancho", store, clock);
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "cancel_booking",
      "check_availability",
      "check_dish",
      "create_booking",
      "get_business_info",
      "get_menu",
    ]);
    const create = tools.find((t) => t.name === "create_booking")!;
    expect(create.annotations?.readOnlyHint).toBe(false);
    expect(create.description).toMatch(/explicit yes/);
    expect(create.inputSchema.required).toEqual(expect.arrayContaining(["date", "time", "party_size", "customer_name", "customer_phone"]));
    expect(tools.find((t) => t.name === "get_menu")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "cancel_booking")!.annotations?.destructiveHint).toBe(true);
    await client.close();
  });

  it("a full voice conversation works end to end over MCP", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("el-rancho", store, clock);
    const info = textOf((await client.callTool({ name: "get_business_info", arguments: {} })) as { content: unknown });
    expect(info.local_now.date).toBe("2026-10-19");
    const menu = textOf((await client.callTool({ name: "get_menu", arguments: { query: "burguer" } })) as { content: unknown });
    expect(menu.categories[0].category).toBe("Hamburguesas");
    const avail = textOf((await client.callTool({ name: "check_availability", arguments: { date: "friday", party_size: 4 } })) as { content: unknown });
    expect(avail.date).toBe("2026-10-23");
    expect(avail.start_time_ranges.length).toBeGreaterThan(0);
    const booked = await client.callTool({
      name: "create_booking",
      arguments: { date: "2026-10-23", time: "21:00", party_size: 4, customer_name: "Lucía", customer_phone: "600111222" },
    });
    expect(booked.isError).toBeFalsy();
    const ref = textOf(booked as { content: unknown }).booking.reference;
    const cancelled = await client.callTool({ name: "cancel_booking", arguments: { reference: ref, customer_phone: "600 111 222" } });
    expect(cancelled.isError).toBeFalsy();
    await client.close();
  });

  it("returns tool errors (isError) — not protocol errors — for things the customer can fix", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("la-familia", store, clock);
    const r = await client.callTool({
      name: "create_booking",
      arguments: { date: "2026-10-24", time: "10:00", service: "Corte y Barba", customer_name: "A", customer_phone: "600111222" },
    });
    expect(r.isError).toBe(true);
    expect(textOf(r as { content: unknown }).code).toBe("slot_closed");
    await client.close();
  });

  it("rejects schema-invalid arguments without crashing", async () => {
    const { store, clock } = await setup();
    const client = await connectClient("el-rancho", store, clock);
    const bad = [
      { date: "2026-10-23", time: "21:00", party_size: "four", customer_name: "A", customer_phone: "600111222" },
      { date: "2026-10-23", time: "21:00", party_size: 2.5, customer_name: "A", customer_phone: "600111222" },
      { date: "2026-10-23", time: "21:00", party_size: 0, customer_name: "A", customer_phone: "600111222" },
      { date: "2026-10-23", time: "21:00", party_size: 2, customer_name: "A".repeat(500), customer_phone: "600111222" },
      { date: "2026-10-23", time: "21:00", party_size: 2, customer_name: "A" },
      {},
    ];
    for (const args of bad) {
      const r = await client.callTool({ name: "create_booking", arguments: args as Record<string, unknown> }).catch((e: Error) => ({ isError: true, thrown: e.message }));
      expect(r.isError, JSON.stringify(args)).toBe(true);
    }
    expect(await store.listBookings((await store.getBusinessBySlug("el-rancho"))!.id)).toHaveLength(0);
    await client.close();
  });

  it("unknown tool → error, not a crash", async () => {
    const { json } = await call(
      "la-familia",
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "drop_tables", arguments: {} } },
      { "MCP-Protocol-Version": "2025-11-25" },
    );
    const result = json.result as Record<string, unknown> | undefined;
    const isErr = Boolean(json.error) || Boolean(result?.isError);
    expect(isErr).toBe(true);
  });
});

describe("transport rules and hardening", () => {
  afterEach(() => {
    delete process.env.BARRIO_ALLOWED_ORIGINS;
  });

  it("GET and DELETE → 405 with Allow header (stateless server, no SSE stream offered)", async () => {
    for (const method of ["GET", "DELETE"]) {
      const { res } = await call("la-familia", null, { Accept: "text/event-stream" }, method);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toContain("POST");
    }
  });

  it("foreign browser Origin → 403 (DNS rebinding protection)", async () => {
    const { res, json } = await call("la-familia", INIT, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(json.id).toBeNull();
  });

  it("same-origin and allow-listed origins are accepted, with CORS headers", async () => {
    const same = await call("la-familia", INIT, { Origin: "https://barrio.test" });
    expect(same.res.status).toBe(200);
    expect(same.res.headers.get("access-control-allow-origin")).toBe("https://barrio.test");
    process.env.BARRIO_ALLOWED_ORIGINS = "https://inspector.example";
    expect(isAllowedOrigin("https://inspector.example", "https://barrio.test/api/mcp/x")).toBe(true);
    expect(isAllowedOrigin("https://inspector.example.evil.com", "https://barrio.test/api/mcp/x")).toBe(false);
    expect(isAllowedOrigin("null", "https://barrio.test/api/mcp/x")).toBe(false);
    expect(isAllowedOrigin("not a url", "https://barrio.test/api/mcp/x")).toBe(false);
  });

  it("CORS preflight → 204", async () => {
    const { res } = await call("la-familia", null, { Origin: "https://barrio.test" }, "OPTIONS");
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version");
  });

  it("unknown business → 404", async () => {
    const { res } = await call("does-not-exist", INIT);
    expect(res.status).toBe(404);
  });

  it("unsupported MCP-Protocol-Version header → 400", async () => {
    const { res } = await call("la-familia", { jsonrpc: "2.0", id: 2, method: "tools/list" }, { "MCP-Protocol-Version": "1999-01-01" });
    expect(res.status).toBe(400);
  });

  it("missing text/event-stream in Accept → 406", async () => {
    const { res } = await call("la-familia", INIT, { Accept: "application/json" });
    expect(res.status).toBe(406);
  });

  it("malformed JSON → 400 parse error, never 500", async () => {
    for (const body of ["{", "not json", "[]", "null", '{"jsonrpc":"1.0"}', '{"jsonrpc":"2.0","id":1}']) {
      const { res } = await call("la-familia", body);
      expect(res.status, body).toBeGreaterThanOrEqual(400);
      expect(res.status, body).toBeLessThan(500);
    }
  });

  it("oversized body → 413", async () => {
    const big = JSON.stringify({ ...INIT, pad: "x".repeat(MAX_BODY_BYTES + 10) });
    const { res } = await call("la-familia", big, { "Content-Length": String(big.length) });
    expect(res.status).toBe(413);
  });

  it("oversized body without Content-Length is still refused", async () => {
    const { store, clock } = await setup();
    const big = JSON.stringify({ ...INIT, pad: "x".repeat(MAX_BODY_BYTES + 10) });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request("https://barrio.test/api/mcp/la-familia", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: stream,
      // @ts-expect-error Node needs duplex for streaming bodies
      duplex: "half",
    });
    const res = await handleMcpRequest(req, "la-familia", { store, clock });
    expect(res.status).toBe(413);
  });

  it("JSON-RPC batches (removed in 2025-06-18) are rejected cleanly", async () => {
    const { res } = await call("la-familia", [INIT, { jsonrpc: "2.0", id: 2, method: "ping" }]);
    expect(res.status).toBeLessThan(500);
  });
});
