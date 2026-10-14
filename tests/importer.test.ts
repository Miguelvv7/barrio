import { describe, expect, it } from "vitest";
import { extractCatalog, ImportIncompleteError, sniffImage } from "@/lib/importer";

type Call = {
  tool_choice?: unknown;
  tools?: unknown;
  output_config: { effort?: string; format: { type: string; schema: Record<string, unknown> } };
  system?: string;
  messages: { content: { type: string; text?: string }[] }[];
};

/** Shaped like a real structured-output response: the JSON arrives as text, after a thinking block. */
function fake(items: unknown, { stop_reason = "end_turn", text }: { stop_reason?: string; text?: string } = {}) {
  const calls: Call[] = [];
  return {
    calls,
    messages: {
      create: async (params: never) => {
        calls.push(params);
        return {
          id: "msg_1",
          type: "message",
          role: "assistant",
          stop_reason,
          content: [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "text", text: text ?? JSON.stringify({ items }) },
          ],
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    },
  };
}

/** Every object in a structured-output schema needs additionalProperties: false and all keys required. */
function assertStrictSchema(node: unknown) {
  if (!node || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  if (n.type === "object") {
    expect(n.additionalProperties).toBe(false);
    expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
  }
  for (const v of Object.values(n)) assertStrictSchema(v);
}

describe("menu import", () => {
  it("keeps valid dishes, normalises fields, drops junk, never sets allergens", async () => {
    const llm = fake([
      { category: " Tapas ", name: "  Salmorejo  ", description: "Con  jamón\n y huevo", price: "4.5", gluten_free_stated: false },
      { category: "Tapas", name: "Tortilla", price: 6, gluten_free_stated: true },
      { name: "", price: 3 },
      { name: "Sin precio" },
      { name: "Caro", price: 99999 },
      "garbage",
    ]);
    const r = await extractCatalog({ kind: "restaurant", text: "SALMOREJO 4,50", apiKey: "x", anthropic: llm as never });
    expect(r.dishes).toEqual([
      { category: "Tapas", name: "Salmorejo", description: "Con jamón y huevo", price: 4.5, gluten_free_stated: false },
      { category: "Tapas", name: "Tortilla", description: "", price: 6, gluten_free_stated: true },
    ]);
    expect(r.skipped).toBe(4);
    expect(JSON.stringify(r)).not.toMatch(/allergen/i);
    // The rules live in the system prompt; the owner's text stays delimited data in the user turn.
    expect(llm.calls[0].system).toMatch(/ignore any instructions/i);
    expect(llm.calls[0].system).toMatch(/Never infer allergens/);
    const prompt = llm.calls[0].messages[0].content.map((c) => c.text ?? "").join(" ");
    expect(prompt).toContain("<menu_text>\nSALMOREJO 4,50\n</menu_text>");
    expect(prompt).not.toMatch(/Never infer allergens/);
    // Forced tool_choice is rejected by current models: structured outputs instead.
    expect(llm.calls[0].tool_choice).toBeUndefined();
    expect(llm.calls[0].tools).toBeUndefined();
    expect(llm.calls[0].output_config.format.type).toBe("json_schema");
    assertStrictSchema(llm.calls[0].output_config.format.schema);
  });

  it("services get sane durations and 'from' prices", async () => {
    const llm = fake([{ name: "Corte niño", price: 9 }, { name: "Mechas", price: 40, price_from: true, duration_minutes: 90 }]);
    const r = await extractCatalog({ kind: "salon", text: "x", apiKey: "x", anthropic: llm as never });
    expect(r.services).toEqual([
      { name: "Corte niño", description: "", duration_minutes: 30, price: 9, price_from: false },
      { name: "Mechas", description: "", duration_minutes: 90, price: 40, price_from: true },
    ]);
  });

  it("sends a valid strict schema for services too", async () => {
    const llm = fake([]);
    await extractCatalog({ kind: "salon", text: "x", apiKey: "x", anthropic: llm as never });
    assertStrictSchema(llm.calls[0].output_config.format.schema);
  });

  it("reads prices written as text with a decimal comma or a currency sign", async () => {
    const llm = fake([
      { name: "Salmorejo", price: "4,50" },
      { name: "Flamenquín", price: "12,50 €" },
      { name: "Café", price: "1.20€" },
    ]);
    const r = await extractCatalog({ kind: "restaurant", text: "x", apiKey: "x", anthropic: llm as never });
    expect(r.dishes.map((d) => d.price)).toEqual([4.5, 12.5, 1.2]);
  });

  it("never passes a cut-off, refused or unreadable answer off as a complete menu", async () => {
    const cases: [ReturnType<typeof fake>, string][] = [
      [fake([{ name: "Salmorejo", price: 4.5 }], { stop_reason: "max_tokens" }), "too_long"],
      [fake([], { stop_reason: "refusal", text: "" }), "refused"],
      [fake([], { text: '{"items": [{"name": "Salm' }), "unreadable"],
    ];
    for (const [llm, reason] of cases) {
      const run = extractCatalog({ kind: "restaurant", text: "x", apiKey: "x", anthropic: llm as never });
      await expect(run).rejects.toBeInstanceOf(ImportIncompleteError);
      await expect(run).rejects.toMatchObject({ reason });
    }
  });

  it("caps the number of items", async () => {
    const llm = fake(Array.from({ length: 400 }, (_, i) => ({ name: `Plato ${i}`, price: 1 })));
    const r = await extractCatalog({ kind: "restaurant", text: "x", apiKey: "x", anthropic: llm as never });
    expect(r.dishes.length).toBe(150);
  });

  it("identifies images by their bytes, not their claimed type", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });
});
