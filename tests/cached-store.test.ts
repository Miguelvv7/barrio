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

describe("CachedStore.listBusinesses", () => {
  it("is cached, and a created or updated business shows up at once", async () => {
    const inner = new MemoryStore();
    let lists = 0;
    const original = inner.listBusinesses.bind(inner);
    inner.listBusinesses = async () => {
      lists++;
      return original();
    };
    const store = new CachedStore(inner, 60_000);
    const first = await store.listBusinesses();
    await store.listBusinesses();
    expect(lists).toBe(1);

    const created = await store.createBusiness({ ...first[0], slug: "new-shop", name: "New Shop", trusted: false });
    expect((await store.listBusinesses()).map((b) => b.slug)).toContain("new-shop");
    expect(lists).toBe(2);

    await store.updateBusiness(created.id, { name: "Renamed Shop" });
    expect((await store.listBusinesses()).find((b) => b.id === created.id)?.name).toBe("Renamed Shop");
    expect(lists).toBe(3);
  });
});
