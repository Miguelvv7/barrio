/**
 * Read-through cache for the data every MCP call needs but that rarely changes: the business rows,
 * their services and menus. Alexa+ expects round trips under 500 ms; this saves 1–2 database
 * round trips per tool call. Bookings are never cached. Writes through this store invalidate
 * immediately on this instance; other serverless instances catch up within `ttlMs`.
 */
import type { Store } from "./types";

type Entry<T> = { value: T; expires: number };

export class CachedStore implements Store {
  readonly kind: Store["kind"];
  private cache = new Map<string, Entry<unknown>>();

  constructor(
    private inner: Store,
    private ttlMs = 15_000,
  ) {
    this.kind = inner.kind;
  }

  private async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Entry<T> | undefined;
    if (hit && hit.expires > Date.now()) return structuredClone(hit.value);
    const value = await load();
    if (value !== null && value !== undefined) this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
    return structuredClone(value);
  }

  private drop(prefix: string) {
    for (const k of this.cache.keys()) if (k.startsWith(prefix)) this.cache.delete(k);
  }

  /** Tests and admin tools. */
  clear() {
    this.cache.clear();
  }

  /** Every directory call lists the businesses: cached like the rest ("__all__" can't be a slug). */
  listBusinesses = () => this.get("biz:__all__", () => this.inner.listBusinesses());
  getBusinessBySlug = (slug: string) => this.get(`biz:${slug}`, () => this.inner.getBusinessBySlug(slug));
  createBusiness: Store["createBusiness"] = async (input) => {
    const b = await this.inner.createBusiness(input);
    this.drop("biz:"); // its slug, and the list
    return b;
  };
  updateBusiness: Store["updateBusiness"] = async (id, patch) => {
    const b = await this.inner.updateBusiness(id, patch);
    this.drop("biz:"); // slug may have changed
    return b;
  };

  listServices = (businessId: string) => this.get(`svc:${businessId}`, () => this.inner.listServices(businessId));
  saveService: Store["saveService"] = async (input) => {
    const s = await this.inner.saveService(input);
    this.drop(`svc:${input.businessId}`);
    return s;
  };
  deleteService: Store["deleteService"] = async (businessId, id) => {
    await this.inner.deleteService(businessId, id);
    this.drop(`svc:${businessId}`);
  };

  listMenu = (businessId: string) => this.get(`menu:${businessId}`, () => this.inner.listMenu(businessId));
  saveMenuItem: Store["saveMenuItem"] = async (input) => {
    const m = await this.inner.saveMenuItem(input);
    this.drop(`menu:${input.businessId}`);
    return m;
  };
  deleteMenuItem: Store["deleteMenuItem"] = async (businessId, id) => {
    await this.inner.deleteMenuItem(businessId, id);
    this.drop(`menu:${businessId}`);
  };

  listBookings: Store["listBookings"] = (businessId, filter) => this.inner.listBookings(businessId, filter);
  createBooking: Store["createBooking"] = (input, limits) => this.inner.createBooking(input, limits);
  purgeBookingsBefore: Store["purgeBookingsBefore"] = (date) => this.inner.purgeBookingsBefore(date);
  cancelBookingById: Store["cancelBookingById"] = (businessId, id) => this.inner.cancelBookingById(businessId, id);
  cancelBooking: Store["cancelBooking"] = (businessId, reference, phone, notBefore) =>
    this.inner.cancelBooking(businessId, reference, phone, notBefore);
}
