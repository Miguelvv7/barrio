/** The Alexa+ simulator must only know what MCP tells it. Uses a scripted fake LLM. */
import { describe, expect, it } from "vitest";
import { runAssistant } from "@/lib/assistant";
import { setup } from "./helpers";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function fakeLLM(script: Block[][]) {
  const calls: { tools: { name: string }[]; system: string; messages: unknown[] }[] = [];
  let i = 0;
  return {
    calls,
    messages: {
      create: async (params: { tools: { name: string }[]; system: string; messages: unknown[] }) => {
        calls.push(structuredClone(params));
        const content = script[Math.min(i++, script.length - 1)];
        return { content, stop_reason: content.some((c) => c.type === "tool_use") ? "tool_use" : "end_turn" };
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

  it("stops after a bounded number of tool rounds", async () => {
    const { store, clock, salon } = await setup();
    const llm = fakeLLM([[{ type: "tool_use", id: "loop", name: "get_business_info", input: {} }]]);
    const out = await runAssistant({ business: salon, store, clock, lang: "en", apiKey: "x", messages: [{ role: "user", content: "hi" }], anthropic: llm as never });
    expect(llm.calls.length).toBeLessThanOrEqual(7);
    expect(out.reply.length).toBeGreaterThan(0);
  });
});
