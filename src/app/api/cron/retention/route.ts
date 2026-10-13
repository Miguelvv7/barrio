import { timingSafeEqual } from "node:crypto";
import { getStore } from "@/lib/store";
import { addDays, nowInZone } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Bookings are kept for 12 months after the appointment, then deleted (see /privacy). */
const RETENTION_DAYS = 365;

/** Called daily by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const cutoff = addDays(nowInZone("Europe/Madrid").date, -RETENTION_DAYS);
  const deleted = await getStore().purgeBookingsBefore(cutoff);
  console.log(JSON.stringify({ evt: "retention_purge", cutoff, deleted }));
  return Response.json({ cutoff, deleted });
}
