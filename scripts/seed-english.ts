/**
 * Fills in the English descriptions of La Familia and El Rancho on an existing database, matching
 * services and dishes by name. Changes nothing else; safe to run more than once.
 *   npm run seed:english        (reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local)
 */
import { createClient } from "@supabase/supabase-js";
import { SEED_TENANTS } from "../src/lib/seed";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see .env.example).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  let missing = 0;
  for (const { business, services, menu } of SEED_TENANTS) {
    const { data: row, error } = await db.from("businesses").select("id").eq("slug", business.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      console.log(`${business.slug}: not in this database, skipped`);
      continue;
    }
    const b = await db.from("businesses").update({ description_en: business.descriptionEn }).eq("id", row.id);
    if (b.error) throw new Error(b.error.message);
    let done = 0;
    const items: [string, { name: string; descriptionEn: string }[]][] = [
      ["services", services],
      ["menu_items", menu],
    ];
    for (const [table, list] of items) {
      for (const item of list) {
        const r = await db.from(table).update({ description_en: item.descriptionEn }).eq("business_id", row.id).eq("name", item.name).select("id");
        if (r.error) throw new Error(r.error.message);
        if (r.data.length) done++;
        else {
          missing++;
          console.log(`${business.slug}: no ${table === "services" ? "service" : "dish"} called "${item.name}" (left as is)`);
        }
      }
    }
    console.log(`${business.slug}: description + ${done} ${business.kind === "salon" ? "services" : "dishes"} in English`);
  }
  console.log(missing ? `Done, ${missing} not found (see above).` : "Done.");
}

main().catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  if (String(error).includes("description_en")) console.error("Run the three description_en lines from supabase/migrations/0001_barrio.sql in the Supabase SQL editor first.");
  process.exit(1);
});
