/** The Alexa+ simulator must only know what MCP tells it. Uses a scripted fake LLM. */
import { describe, expect, it } from "vitest";
import { runAssistant } from "@/lib/assistant";
import { handleMcpRequest } from "@/lib/mcp/handler";
import { BASE, setup } from "./helpers";

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type Step = Block[] | { content: Block[]; stop_reason: string };
type Params = { tools: { name: string }[]; system: string; messages: unknown[]; max_tokens: number; output_config?: { effort?: string } };

/**
 * Shaped like the real API: Haiku 5.5 thinks by default, so every response starts with a thinking
 * block (empty text, as with the default "omitted" display) that has to be sent back unchanged.
 */
function fakeLLM(script: Step[]) {
  const calls: Params[] = [];
  let i = 0;
  return {
    calls,
    messages: {
      create: async (params: Params) => {
        calls.push(structuredClone(params));
        const step = script[Math.min(i, script.length - 1)];
        const thinking: Block = { type: "thinking", thinking: "", signature: `sig${i++}` };
        if (!Array.isArray(step)) return { content: [thinking, ...step.content], stop_reason: step.stop_reason };
        return { content: [thinking, ...step], stop_reason: step.some((c) => c.type === "tool_use") ? "tool_use" : "end_turn" };
      },
    },
  };
}

describe("Alexa+ simulator agent", () => {
  it("discovers tools via MCP, calls them, and feeds results back", async () => {
    const { store, clock, salon } = await setup();
    const llm = fakeLLM([
      [{ type: "tool_use", id: "t1", name: "check_availability", input: { date: "tomorrow", service: "corte y barba" } }],
      [
        {
          type: "tool_use",
          id: "t2",
          name: "create_booking",
          input: { date: "2026-10-20", time: "17:00", service: "Corte y Barba", customer_name: "Miguel", customer_phone: "600123456" },
        },
      ],
      [{ type: "text", text: "Done! You're booked for five pm." }],
    ]);
    const out = await runAssistant({
      business: salon,
      store,
      clock,
      lang: "en",
      apiKey: "test",
      messages: [{ role: "user", content: "Haircut and beard tomorrow at five, Miguel 600123456" }],
      anthropic: llm as never,
    });
    expect(out.reply).toBe("Done! You're booked for five pm.");
    expect(out.trace.map((t) => t.name)).toEqual(["check_availability", "create_booking"]);
    expect(out.trace.every((t) => !t.isError)).toBe(true);
    expect(llm.calls[0].tools.map((t) => t.name).sort()).toEqual(
      ["cancel_booking", "check_availability", "create_booking", "get_business_info", "get_services"],
    );
    expect(llm.calls[0].system).toContain("2026-10-19");
    expect(JSON.stringify(llm.calls[0].tools)).not.toContain("$schema");
    expect(llm.calls[0].system).toContain("explicit yes");
    expect(await store.listBookings(salon.id)).toHaveLength(1);
  });

  it("passes tool errors back to the model instead of crashing", async () => {
    const { store, clock, restaurant } = await setup();
    const llm = fakeLLM([
      [{ type: "tool_use", id: "t1", name: "check_dish", input: { dish: "paella" } }],
      [{ type: "tool_use", id: "t2", name: "nonexistent_tool", input: {} }],
      [{ type: "text", text: "We don't have paella." }],
    ]);
    const out = await runAssistant({ business: restaurant, store, clock, lang: "es", apiKey: "x", messages: [{ role: "user", content: "¿Tenéis paella?" }], anthropic: llm as never });
    expect(out.trace[0].isError).toBe(true);
    expect(out.trace[1].isError).toBe(true);
    expect(out.reply).toBe("We don't have paella.");
    expect(llm.calls[0].system).toContain("Spanish");
  });

  it("stops after a bounded number of tool rounds without speaking a preamble as the answer", async () => {
    const { store, clock, salon } = await setup();
    const llm = fakeLLM([[{ type: "text", text: "Let me look that up." }, { type: "tool_use", id: "loop", name: "get_business_info", input: {} }]]);
    const out = await runAssistant({ business: salon, store, clock, lang: "en", apiKey: "x", messages: [{ role: "user", content: "hi" }], anthropic: llm as never });
    expect(llm.calls.length).toBeLessThanOrEqual(7);
    expect(out.reply).toMatch(/couldn't finish/);
  });

  it("keeps the system prompt byte-identical across tool rounds, even when the minute changes", async () => {
    const { store, salon } = await setup();
    const minutes = ["20:59", "21:00", "21:01"];
    let n = 0;
    // A clock that ticks on every read, like a real one crossing a minute boundary mid-request.
    const ticking = { now: () => ({ date: "2026-10-19", time: minutes[Math.min(n++, 2)], weekday: 1, minutes: 0 }) };
    const llm = fakeLLM([
      [{ type: "tool_use", id: "t1", name: "get_services", input: {} }],
      [{ type: "tool_use", id: "t2", name: "get_business_info", input: {} }],
      [{ type: "text", text: "We do haircuts." }],
    ]);
    await runAssistant({ business: salon, store, clock: ticking as never, lang: "en", apiKey: "x", messages: [{ role: "user", content: "what do you do" }], anthropic: llm as never });
    expect(llm.calls).toHaveLength(3);
    expect(new Set(llm.calls.map((c) => c.system)).size).toBe(1);
    // Thinking blocks go back unchanged, and there's room for them on top of the spoken reply.
    expect(JSON.stringify(llm.calls[1].messages)).toContain('"signature":"sig0"');
    expect(llm.calls[0].max_tokens).toBeGreaterThanOrEqual(2000);
    expect(llm.calls[0].output_config?.effort).toBe("low");
  });

  it("never speaks a cut-off or refused reply, and still shows the card of a booking that went through", async () => {
    const { store, clock, salon } = await setup();
    for (const stop_reason of ["max_tokens", "refusal"]) {
      const llm = fakeLLM([
        [{ type: "tool_use", id: "t1", name: "get_services", input: {} }],
        { content: [{ type: "text", text: "We have the Clásica at twelve euros, the" }], stop_reason },
      ]);
      const out = await runAssistant({ business: salon, store, clock, lang: "en", apiKey: "x", messages: [{ role: "user", content: "prices?" }], anthropic: llm as never });
      expect(out.reply).not.toContain("twelve euros, the");
      expect(out.reply).toMatch(/couldn't finish/);
      expect(out.ui?.html).toBeTruthy();
    }
  });

  it("falls back to a short apology when the model only thinks and says nothing", async () => {
    const { store, clock, salon } = await setup();
    const llm = fakeLLM([[]]);
    const out = await runAssistant({ business: salon, store, clock, lang: "es", apiKey: "x", messages: [{ role: "user", content: "eh" }], anthropic: llm as never });
    expect(out.reply).toMatch(/no te he entendido/);
  });

  it("talks to the business's MCP endpoint over Streamable HTTP, like Alexa+ would", async () => {
    const { store, clock, salon } = await setup();
    const methods: string[] = [];
    const fetchThroughHandler: typeof fetch = async (input, init) => {
      const request = new Request(input as string, init as RequestInit);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.method) methods.push(`${request.method} ${new URL(request.url).pathname} ${body.method}`);
      return handleMcpRequest(request, salon.slug, { store, clock });
    };
    const llm = fakeLLM([
      [{ type: "tool_use", id: "t1", name: "get_services", input: {} }],
      [{ type: "text", text: "A haircut is fifteen euros." }],
    ]);
    const out = await runAssistant({
      business: salon,
      store,
      clock,
      lang: "en",
      apiKey: "x",
      messages: [{ role: "user", content: "How much is a haircut?" }],
      anthropic: llm as never,
      mcpUrl: `${BASE}/api/mcp/${salon.slug}`,
      fetch: fetchThroughHandler,
    });
    expect(out.transport).toEqual({ kind: "streamable-http", url: `${BASE}/api/mcp/${salon.slug}` });
    expect(out.reply).toBe("A haircut is fifteen euros.");
    expect(methods).toEqual(
      expect.arrayContaining([
        "POST /api/mcp/la-familia initialize",
        "POST /api/mcp/la-familia tools/list",
        "POST /api/mcp/la-familia tools/call",
        "POST /api/mcp/la-familia resources/read",
      ]),
    );
    expect(out.ui?.html).toBeTruthy();
  });

  it("a first-turn \"which one?\" still brings the card, so the screen can show the options", async () => {
    const { store, clock, restaurant } = await setup();
    const llm = fakeLLM([
      [{ type: "tool_use", id: "t1", name: "check_dish", input: { dish: "taco" } }],
      [{ type: "text", text: "Which taco do you mean?" }],
    ]);
    const out = await runAssistant({ business: restaurant, store, clock, lang: "en", apiKey: "x", anthropic: llm as never, messages: [{ role: "user", content: "Is the taco gluten-free?" }] });
    expect(out.trace.at(-1)?.isError).toBe(true);
    expect(out.ui?.html).toContain("<html");
  });

  it("falls back to an in-process MCP client when its own endpoint can't be reached", async () => {
    const { store, clock, salon } = await setup();
    const llm = fakeLLM([[{ type: "text", text: "Hello." }]]);
    const out = await runAssistant({
      business: salon, store, clock, lang: "en", apiKey: "x", anthropic: llm as never,
      messages: [{ role: "user", content: "hi" }],
      mcpUrl: `${BASE}/api/mcp/${salon.slug}`,
      fetch: async () => new Response("Authentication required", { status: 401 }),
    });
    expect(out.transport).toEqual({ kind: "in-process" });
    expect(out.reply).toBe("Hello.");
  });
});
