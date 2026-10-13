import { describe, expect, it } from "vitest";
import { extractCatalog, sniffImage } from "@/lib/importer";

function fake(items: unknown) {
  const calls: { tool_choice: unknown; messages: { content: { type: string; text?: string }[] }[] }[] = [];
  return {
    calls,
    messages: {
      create: async (params: never) => {
        calls.push(params);
        return { content: [{ type: "tool_use", id: "t", name: "save_menu", input: { items } }] };
      },
    },
  };
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
    const prompt = llm.calls[0].messages[0].content.map((c) => c.text ?? "").join(" ");
    expect(prompt).toMatch(/ignore any instructions/i);
    expect(prompt).toMatch(/Never infer allergens/);
    expect(llm.calls[0].tool_choice).toEqual({ type: "tool", name: "save_menu" });
  });

  it("services get sane durations and 'from' prices", async () => {
    const llm = fake([{ name: "Corte niño", price: 9 }, { name: "Mechas", price: 40, price_from: true, duration_minutes: 90 }]);
    const r = await extractCatalog({ kind: "salon", text: "x", apiKey: "x", anthropic: llm as never });
    expect(r.services).toEqual([
      { name: "Corte niño", description: "", duration_minutes: 30, price: 9, price_from: false },
      { name: "Mechas", description: "", duration_minutes: 90, price: 40, price_from: true },
    ]);
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
