import { ConfigError, isVercelProduction } from "../env";
import { CachedStore } from "./cached";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export * from "./types";

const globalForStore = globalThis as unknown as { __barrioStore?: Store };

/**
 * Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set; otherwise an in-memory store
 * seeded with the demo businesses (zero-config local dev). Cached on globalThis so dev hot-reloads
 * don't wipe bookings.
 */
export function getStore(): Store {
  if (!globalForStore.__barrioStore) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    // On serverless each instance would get its own in-memory bookings: double bookings, lost data.
    if (!(url && key) && isVercelProduction() && process.env.BARRIO_ALLOW_MEMORY_STORE !== "1") {
      throw new ConfigError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel project settings.");
    }
    globalForStore.__barrioStore = url && key ? new CachedStore(new SupabaseStore(url, key)) : new MemoryStore();
  }
  return globalForStore.__barrioStore;
}

/** Tests only. */
export function setStoreForTesting(store: Store | undefined) {
  globalForStore.__barrioStore = store;
}
