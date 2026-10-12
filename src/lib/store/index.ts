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
    globalForStore.__barrioStore = url && key ? new SupabaseStore(url, key) : new MemoryStore();
  }
  return globalForStore.__barrioStore;
}

/** Tests only. */
export function setStoreForTesting(store: Store | undefined) {
  globalForStore.__barrioStore = store;
}
