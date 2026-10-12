/**
 * The "simulated Alexa+" used by the /try page: a Claude agent whose ONLY tools are the ones
 * discovered from the business's MCP server (tools/list → tools/call). It holds no business data
 * of its own, so everything it says about prices, times or allergens comes through MCP.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BookingService, systemClock, type Clock } from "./booking-service";
import { buildMcpServer } from "./mcp/server";
import type { Store } from "./store/types";
import { WEEKDAY_NAMES_EN } from "./time";
import type { Business } from "./types";

export const DEFAULT_MODEL = "claude-haiku-5-5";
const MAX_TOOL_ROUNDS = 6;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  isError: boolean;
  /** First ~600 chars of the tool's JSON result, for the "under the hood" panel. */
  result: string;
}

export interface AssistantReply {
  reply: string;
  trace: ToolTrace[];
}

export type Lang = "en" | "es";

function systemPrompt(business: Business, instructions: string, lang: Lang, clock: Clock) {
  const now = clock.now(business.timezone);
  return [
    "You are simulating Alexa+, Amazon's voice assistant, talking to a customer on a smart speaker.",
    `The customer is talking to ${business.name} through its Barrio MCP server.`,
    "",
    "Server instructions:",
    instructions,
    "",
    `Local time at the business: ${WEEKDAY_NAMES_EN[now.weekday]} ${now.date} ${now.time} (${business.timezone}).`,
    lang === "es"
      ? "Reply in Spanish (Spain)."
      : "Reply in English. Business data is in Spanish: keep proper names of dishes and services as they are, and translate descriptions naturally.",
    "This is VOICE: one to three short sentences, no lists, no markdown, no emojis. Say times like 'five fifteen pm' only if speaking English; prices with the currency word.",
    "Read at most three time options aloud. Spell booking references letter by letter.",
    "To book you need: date, time, " +
      (business.kind === "restaurant" ? "party size" : "service") +
      ", the customer's name and phone number. Ask for anything missing, one thing at a time.",
    "Before create_booking, read the details back and wait for an explicit yes in a separate turn.",
    "If a tool returns an error, explain it simply and offer the alternatives it gives you.",
    "Never invent information the tools didn't return.",
  ].join("\n");
}

function clip(text: string, max = 600) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function runAssistant(opts: {
  business: Business;
  store: Store;
  clock?: Clock;
  messages: ChatMessage[];
  lang: Lang;
  apiKey: string;
  model?: string;
  anthropic?: Pick<Anthropic, "messages">;
}): Promise<AssistantReply> {
  const service = new BookingService(opts.store, opts.clock);
  const server = buildMcpServer(opts.business, service);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "barrio-alexa-simulator", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const { tools } = await client.listTools();
    const instructions = client.getInstructions() ?? "";
    const anthropic = opts.anthropic ?? new Anthropic({ apiKey: opts.apiKey });
    const trace: ToolTrace[] = [];

    const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: 600,
        system: systemPrompt(opts.business, instructions, opts.lang, opts.clock ?? systemClock),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description ?? "",
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        })),
        messages,
      });

      const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0 || round === MAX_TOOL_ROUNDS) {
        const reply = response.content
          .filter((c): c is Anthropic.TextBlock => c.type === "text")
          .map((c) => c.text)
          .join(" ")
          .trim();
        return { reply: reply || "Sorry, I didn't catch that. Could you say it again?", trace };
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const args = (use.input ?? {}) as Record<string, unknown>;
        let text: string;
        let isError = false;
        try {
          const result = await client.callTool({ name: use.name, arguments: args });
          const content = (result.content as { type: string; text?: string }[]) ?? [];
          text = content.map((c) => c.text ?? "").join("\n");
          isError = Boolean(result.isError);
        } catch (error) {
          text = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
          isError = true;
        }
        trace.push({ name: use.name, arguments: args, isError, result: clip(text) });
        results.push({ type: "tool_result", tool_use_id: use.id, content: text, is_error: isError });
      }
      messages.push({ role: "user", content: results });
    }
    return { reply: "Sorry, something went wrong.", trace };
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
