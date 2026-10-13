import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { BookingService, type Clock } from "@/lib/booking-service";
import { handleMcpRequest } from "@/lib/mcp/handler";
import { MemoryStore } from "@/lib/store/memory";
import { toMinutes, weekdayOf, type LocalNow } from "@/lib/time";

/** Frozen "now" in business-local time. Default: Monday 2026-10-19 08:00 in Écija. */
export function fixedClock(date = "2026-10-19", time = "08:00"): Clock & { set(d: string, t: string): void } {
  let current: LocalNow = { date, time, weekday: weekdayOf(date), minutes: toMinutes(time) };
  return {
    now: () => current,
    set(d, t) {
      current = { date: d, time: t, weekday: weekdayOf(d), minutes: toMinutes(t) };
    },
  };
}

export async function setup(clock = fixedClock()) {
  const store = new MemoryStore();
  const service = new BookingService(store, clock);
  const salon = (await store.getBusinessBySlug("la-familia"))!;
  const restaurant = (await store.getBusinessBySlug("el-rancho"))!;
  return { store, service, clock, salon, restaurant };
}

export const BASE = "https://barrio.test";

/** An official MCP SDK client whose HTTP calls are routed straight into our handler (no network). */
export async function connectClient(slug: string | null, store: MemoryStore, clock: Clock) {
  const transport = new StreamableHTTPClientTransport(new URL(slug ? `${BASE}/api/mcp/${slug}` : `${BASE}/api/mcp`), {
    fetch: async (input, init) => {
      const request = new Request(input as string, init as RequestInit);
      return handleMcpRequest(request, slug, { store, clock });
    },
  });
  const client = new Client({ name: "barrio-tests", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

export function rpc(slug: string, body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new Request(`${BASE}/api/mcp/${slug}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

export function textOf(result: { content: unknown }) {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0].text);
}
