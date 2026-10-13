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
