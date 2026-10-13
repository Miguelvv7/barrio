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
/** Stop starting new model calls after this: with 15 s per call and one retry, a slow API never outlives the 60 s function. */
const DEADLINE_MS = 25_000;
const GIVE_UP = {
  en: "Sorry, I couldn't finish that. Could you ask me again?",
  es: "Perdona, no he podido terminar. ¿Me lo puedes repetir?",
};

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
  /** What a screen device receives: structured data + the MCP App to render it with. */
  structuredContent?: Record<string, unknown>;
  uiResourceUri?: string;
}

export interface AssistantReply {
  reply: string;
  trace: ToolTrace[];
  /** MCP App HTML, read from the server with resources/read — only for URIs the page doesn't have yet. */
  ui?: { uri: string; html: string };
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
  /** UI resource URIs the page already holds, so we don't resend the HTML. */
  knownUiUris?: string[];
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
    const anthropic = opts.anthropic ?? new Anthropic({ apiKey: opts.apiKey, timeout: 15_000, maxRetries: 1 });
    const trace: ToolTrace[] = [];
    // Built once per request: the system prompt must stay byte-identical across tool rounds, or the
    // API rejects the replayed thinking blocks (and the prompt cache misses).
    const system = systemPrompt(opts.business, instructions, opts.lang, opts.clock ?? systemClock);
    const apiTools = tools.map((t) => {
      // Drop the JSON-Schema "$schema" marker: the API only needs the schema itself.
      const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
      void _ignored;
      return { name: t.name, description: t.description ?? "", input_schema: schema as Anthropic.Tool.InputSchema };
    });
    const startedAt = Date.now();
    // Like Alexa+ on an Echo Show: show the MCP App for the last tool that has one — also when the
    // reply is an apology, so a booking that did go through still shows its card.
    const finish = async (reply: string): Promise<AssistantReply> => {
      const uiUri = [...trace].reverse().find((t) => t.uiResourceUri && t.structuredContent)?.uiResourceUri;
      let ui: AssistantReply["ui"];
      if (uiUri && !opts.knownUiUris?.includes(uiUri)) {
        const read = await client.readResource({ uri: uiUri });
        const first = read.contents[0] as { text?: string } | undefined;
        if (first?.text) ui = { uri: uiUri, html: first.text };
      }
      return { reply, trace, ui };
    };

    const messages: Anthropic.MessageParam[] = opts.messages.map((m) => ({ role: m.role, content: m.content }));

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      if (round > 0 && Date.now() - startedAt > DEADLINE_MS) return await finish(GIVE_UP[opts.lang]);
      const response = await anthropic.messages.create({
        model: opts.model ?? DEFAULT_MODEL,
        // Thinking counts toward max_tokens: leave room for it. Low effort keeps voice replies fast.
        max_tokens: 2000,
        output_config: { effort: "low" },
        system,
        tools: apiTools,
        messages,
      });

      // Cut off mid-sentence or mid-tool-call, refused, or still calling tools after the last
      // round: never speak a half answer or a "let me check" preamble as if it were the reply.
      if (response.stop_reason === "max_tokens" || response.stop_reason === "refusal") return await finish(GIVE_UP[opts.lang]);
      const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");
      if (response.stop_reason === "tool_use" && toolUses.length > 0 && round === MAX_TOOL_ROUNDS) {
        return await finish(GIVE_UP[opts.lang]);
      }
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const reply = response.content
          .filter((c): c is Anthropic.TextBlock => c.type === "text")
          .map((c) => c.text)
          .join(" ")
          .trim();
        const fallback = opts.lang === "es" ? "Perdona, no te he entendido. ¿Me lo repites?" : "Sorry, I didn't catch that. Could you say it again?";
        return await finish(reply || fallback);
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        const args = (use.input ?? {}) as Record<string, unknown>;
        let text: string;
        let isError = false;
        let structuredContent: Record<string, unknown> | undefined;
        let uiResourceUri: string | undefined;
        try {
          const result = await client.callTool({ name: use.name, arguments: args });
          const content = (result.content as { type: string; text?: string }[]) ?? [];
          text = content.map((c) => c.text ?? "").join("\n");
          isError = Boolean(result.isError);
          structuredContent = result.structuredContent as Record<string, unknown> | undefined;
          uiResourceUri = (result._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
        } catch (error) {
          text = JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
          isError = true;
        }
        trace.push({ name: use.name, arguments: args, isError, result: clip(text), structuredContent, uiResourceUri });
        results.push({ type: "tool_result", tool_use_id: use.id, content: text, is_error: isError });
      }
      messages.push({ role: "user", content: results });
    }
    return await finish(GIVE_UP[opts.lang]);
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
