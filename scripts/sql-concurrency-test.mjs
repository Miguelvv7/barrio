/**
 * Verifies supabase/migrations/0001_barrio.sql on a real, DISPOSABLE PostgreSQL database:
 * applies the migration (twice), then fires concurrent bookings at create_booking_atomic().
 *
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/barrio_test node scripts/sql-concurrency-test.mjs
 *
 * On a Mac: `brew install postgresql@16 && brew services start postgresql@16 && createdb barrio_test`.
 * Never point this at your production database: it inserts test businesses.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to a disposable database.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 30 });
const sql = readFileSync(new URL("../supabase/migrations/0001_barrio.sql", import.meta.url), "utf8");
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const suffix = Math.random().toString(36).slice(2, 7);

try {
  await pool.query(sql);
  await pool.query(sql);
  check(true, "migration applies twice (idempotent)");

  const biz = async (slug, kind, capacity) =>
    (await pool.query(`insert into businesses (slug, name, kind, capacity) values ($1,$1,$2,$3) returning id`, [`${slug}-${suffix}`, kind, capacity])).rows[0].id;
  const salon = await biz("salon", "salon", 1);
  const rest = await biz("rest", "restaurant", 8);
  const rate = await biz("rate", "salon", 1);

  // (business, date, time, duration, phone, source, maxPerPhone, today, maxMcpPerHour)
  const book = (b, time, phone, { dur = 30, date = "2030-10-22", source = "mcp", perPhone = 3, perHour = 0 } = {}) =>
    pool.query(
      `select * from create_booking_atomic($1,$2,$3,$4,null,'x',1,'Cliente',$5,'',$6,$7,'2030-10-21',$8)`,
      [b, date, time, dur, phone, source, perPhone, perHour],
    );
  const outcome = (p) => p.then(() => "ok", (e) => e.message);

  const r100 = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => book(salon, "11:00", `6${10_000_000 + i}`)));
  const ok = r100.filter((r) => r.status === "fulfilled").length;
  const taken = r100.filter((r) => r.status === "rejected" && /SLOT_TAKEN/.test(r.reason.message)).length;
  check(ok === 1 && taken === 99, `100 parallel bookings for one slot → ${ok} ok / ${taken} SLOT_TAKEN (want 1/99)`);
  check((await outcome(book(salon, "11:15", "699000001"))).includes("SLOT_TAKEN"), "overlapping 11:15 rejected");
  check((await outcome(book(salon, "11:30", "699000002"))) === "ok", "adjacent 11:30 accepted");

  const r8 = await Promise.allSettled(Array.from({ length: 100 }, (_, i) => book(rest, "21:00", `7${10_000_000 + i}`, { dur: 90 })));
  check(r8.filter((r) => r.status === "fulfilled").length === 8, `restaurant: 100 parallel → ${r8.filter((r) => r.status === "fulfilled").length} ok (want 8 = capacity)`);

  const spam = await Promise.allSettled(["09:00", "09:30", "10:00", "12:00", "12:30", "13:00"].map((t) => book(salon, t, "+34 655 000 000", { date: "2030-10-23" })));
  check(spam.filter((r) => r.status === "fulfilled").length === 3, "same phone 6× in parallel → 3 ok");
  check((await outcome(book(salon, "17:00", "0034655000000", { date: "2030-10-23" }))).includes("TOO_MANY_BOOKINGS"), "same phone, other format, still counted");
  check((await outcome(book(salon, "17:30", "", { date: "2030-10-23", source: "dashboard", perPhone: 0 }))) === "ok", "owner walk-in without phone accepted");

  const flood = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => book(rate, `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`, `68${1_000_000 + i}`, { perHour: 20 })));
  const floodOk = flood.filter((r) => r.status === "fulfilled").length;
  check(floodOk === 20, `hourly cap: 30 assistant bookings → ${floodOk} ok (want 20), rest RATE_LIMITED`);
  // Another date: the flood may have taken 20:00, and the cap counts by created_at, not by date.
  check((await outcome(book(rate, "20:00", "", { date: "2030-10-23", source: "dashboard", perPhone: 0, perHour: 20 }))) === "ok", "hourly cap doesn't block the owner");

  // Capacity is the peak in use at once: 10:00×30 and 10:30×30 never overlap each other, so a
  // 10:00×60 still fits in capacity 2 — and a second one doesn't.
  const peak = await biz("peak", "restaurant", 2);
  await book(peak, "10:00", "655100001", { date: "2030-10-24" });
  await book(peak, "10:30", "655100002", { date: "2030-10-24" });
  check((await outcome(book(peak, "10:00", "655100003", { date: "2030-10-24", dur: 60 }))) === "ok", "capacity counts the peak in use, not every overlap");
  check((await outcome(book(peak, "10:00", "655100004", { date: "2030-10-24", dur: 60 }))).includes("SLOT_TAKEN"), "…and still refuses the one that would exceed it");

  const retries = await Promise.allSettled([1, 2, 3].map(() => book(rest, "13:00", "+34 655 200 000", { date: "2030-10-24", dur: 90 })));
  check(
    retries.filter((r) => r.status === "fulfilled").length === 1 &&
      retries.filter((r) => r.status === "rejected" && /DUPLICATE_BOOKING:[A-Z0-9]{4}/.test(r.reason.message)).length === 2,
    "3 identical requests in parallel → 1 booking, 2 DUPLICATE_BOOKING with its reference",
  );
  const alice = await outcome(book(rest, "13:30", "+1 212 555 0100", { date: "2030-10-24", dur: 90 }));
  const bob = await outcome(book(rest, "13:30", "+1 312 555 0100", { date: "2030-10-24", dur: 90 }));
  check(alice === "ok" && bob === "ok", `US numbers differing only in area code are different customers (${alice} / ${bob})`);
  const { rows: [{ n: dupes }] } = await pool.query(`select count(*)::int as n from bookings where business_id = $1 and customer_phone = '+34 655 200 000'`, [rest]);
  check(dupes === 1, `retried request stored once (got ${dupes})`);
  check(
    (await outcome(pool.query(`select * from create_booking_atomic($1,'2030-10-24','15:00',30,'00000000-0000-0000-0000-000000000000','x',1,'Cliente','655300000','','mcp',3,'2030-10-21',0)`, [salon]))).includes("SERVICE_UNAVAILABLE"),
    "a deleted or foreign service is refused under the lock",
  );

  const { rows: refs } = await pool.query(`select reference from bookings`);
  check(refs.every((r) => /^[ACDEFGHJKMNPQRTUVWXY34679]{4}$/.test(r.reference)), "references use the readable alphabet");
  check((await outcome(pool.query(`insert into bookings (business_id, reference, date, start_time, duration_minutes, customer_name) values ($1,'ACDE','2030-10-20','25:00',30,'x')`, [salon]))) !== "ok", "DB rejects start_time 25:00");
  check((await outcome(pool.query(`insert into businesses (slug, name, kind) values ('Bad Slug!','x','salon')`))) !== "ok", "DB rejects invalid slug");
  check((await outcome(book("00000000-0000-0000-0000-000000000000", "10:00", "600000000"))).includes("BUSINESS_NOT_FOUND"), "unknown business rejected");
  const { rows: [{ rls }] } = await pool.query(`select bool_and(relrowsecurity) as rls from pg_class where relname in ('businesses','services','menu_items','bookings')`);
  check(rls === true, "row level security enabled on every table");
} catch (e) {
  console.log("FAIL  unexpected", e);
  failures++;
} finally {
  await pool.end();
}
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL SQL CHECKS PASSED");
process.exit(failures ? 1 : 0);
