import { SEED_TENANTS } from "./seed";
import type { Store } from "./store/types";

/** Loads the demo tenants into any store. Skips tenants whose slug already exists. */
export async function seedInto(store: Store, log: (msg: string) => void = () => {}) {
  for (const tenant of SEED_TENANTS) {
    if (await store.getBusinessBySlug(tenant.business.slug)) {
      log(`skip ${tenant.business.slug} (already exists)`);
      continue;
    }
    const business = await store.createBusiness(tenant.business);
    for (const s of tenant.services) await store.saveService({ ...s, businessId: business.id });
    for (const m of tenant.menu) await store.saveMenuItem({ ...m, businessId: business.id });
    log(`created ${business.slug}: ${tenant.services.length} services, ${tenant.menu.length} menu items`);
  }
}
