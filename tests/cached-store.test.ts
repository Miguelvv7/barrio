import { describe, expect, it } from "vitest";
import { CachedStore } from "@/lib/store/cached";
import { MemoryStore } from "@/lib/store/memory";

describe("CachedStore", () => {
  it("serves reads from cache, invalidates on writes, and never caches bookings", async () => {
    const inner = new MemoryStore();
    let reads = 0;
    const counting = new Proxy(inner, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v === "function" && ["getBusinessBySlug", "listServices", "listBookings"].includes(String(prop))) {
          return (...args: unknown[]) => {
            reads++;
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const store = new CachedStore(counting, 60_000);
    const b1 = await store.getBusinessBySlug("la-familia");
    await store.getBusinessBySlug("la-familia");
    expect(reads).toBe(1);
    await store.listServices(b1!.id);
    await store.listServices(b1!.id);
    expect(reads).toBe(2);

    const svc = (await store.listServices(b1!.id))[0];
    await store.saveService({ ...svc, price: 99 });
    expect((await store.listServices(b1!.id)).find((s) => s.id === svc.id)!.price).toBe(99);

    // Mutating a returned object must not poison the cache.
    const copy = await store.getBusinessBySlug("la-familia");
    copy!.name = "HACKED";
    expect((await store.getBusinessBySlug("la-familia"))!.name).toBe("Peluquería La Familia");

    const before = reads;
    await store.listBookings(b1!.id);
    await store.listBookings(b1!.id);
    expect(reads - before).toBe(2);

    await store.updateBusiness(b1!.id, { name: "La Familia 2" });
    expect((await store.getBusinessBySlug("la-familia"))!.name).toBe("La Familia 2");
    expect(await store.getBusinessBySlug("nope")).toBeNull();
  });
});
