/**
 * Loads La Familia and El Rancho into Supabase.
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run seed
 */
import { seedInto } from "../src/lib/seed-into";
import { SupabaseStore } from "../src/lib/store/supabase";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.example).");
  process.exit(1);
}
await seedInto(new SupabaseStore(url, key), console.log);
console.log("Done.");
