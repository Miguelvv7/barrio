/** Found by trying the simulator with real Claude: each test reproduces the bug before the fix. */
import { describe, expect, it } from "vitest";
import { setup } from "./helpers";

describe("menu questions in English", () => {
  it.each(["burger", "burgers", "What burgers do you have"])("%s lists every burger, in menu order", async (query) => {
    const { service, restaurant } = await setup();
    const all = (await service.getCatalog(restaurant, "hamburguesa")) as { categories: { items: { name: string }[] }[] };
    const asked = (await service.getCatalog(restaurant, query)) as typeof all;
    const names = (r: typeof all) => r.categories.flatMap((c) => c.items.map((i) => i.name));
    expect(names(all)).toContain("Chicken Cheddar");
    expect(names(asked)).toEqual(names(all));
  });
});

describe("simulator history", () => {
  it("tells the model which MCP calls were behind its earlier answers", async () => {
    const { runAssistant } = await import("@/lib/assistant");
    const { store, salon } = await setup();
    const calls: { system: string }[] = [];
    const llm = {
      messages: {
        create: async (params: { system: string }) => {
          calls.push(params);
          return { content: [{ type: "text", text: "Booked." }], stop_reason: "end_turn" };
        },
      },
    };
    await runAssistant({
      business: salon,
      store,
      lang: "en",
      apiKey: "x",
      anthropic: llm as never,
      messages: [
        { role: "user", content: "Beard trim Friday at 11?" },
        { role: "assistant", content: "Eleven is free. Shall I book it?", tools: ['check_availability({"date":"2026-10-16"})'] },
        { role: "user", content: "Yes" },
      ],
    });
    expect(calls[0].system).toContain('Reply 1: check_availability({"date":"2026-10-16"})');
  });
});

describe("opening the MCP URL in a browser", () => {
  it("shows a page that explains it (still a 405), while MCP clients get JSON-RPC", async () => {
    const { handleMcpRequest } = await import("@/lib/mcp/handler");
    const { store, clock } = await setup();
    const url = "https://barrio.test/api/mcp/la-familia";
    const browser = await handleMcpRequest(new Request(url, { headers: { Accept: "text/html,application/xhtml+xml" } }), "la-familia", { store, clock });
    expect(browser.status).toBe(405);
    expect(browser.headers.get("content-type")).toContain("text/html");
    const page = await browser.text();
    expect(page).toContain("This is an MCP server");
    expect(page).toContain("https://barrio.test/try/la-familia");
    const client = await handleMcpRequest(new Request(url, { headers: { Accept: "text/event-stream" } }), "la-familia", { store, clock });
    expect(client.headers.get("content-type")).toContain("json");
  });
});

describe("opening hours that end at midnight", () => {
  it("00:00 as a closing time means midnight (a time picker can't say 24:00)", async () => {
    const { parseHours } = await import("@/lib/forms");
    const f = new FormData();
    f.set("d6_open1", "12:00");
    f.set("d6_close1", "16:00");
    f.set("d6_open2", "19:00");
    f.set("d6_close2", "00:00");
    expect(parseHours(f)).toEqual({
      ok: true,
      data: [
        { weekday: 6, opens: "12:00", closes: "16:00" },
        { weekday: 6, opens: "19:00", closes: "24:00" },
      ],
    });
    f.set("d6_open1", "24:00");
    expect(parseHours(f).ok).toBe(false);
  });
});
