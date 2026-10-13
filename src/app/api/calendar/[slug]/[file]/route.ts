import { timingSafeEqual } from "node:crypto";
import { buildIcs, calendarToken } from "@/lib/ics";
import { calendarSecret } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { addDays, nowInZone } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/calendar/<slug>/<token>.ics — secret, unguessable subscription URL for the owner. */
export async function GET(_req: Request, ctx: RouteContext<"/api/calendar/[slug]/[file]">) {
  const { slug, file } = await ctx.params;
  const token = file.replace(/\.ics$/, "");
  const expected = calendarToken(slug, calendarSecret());
  const ok = token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  const store = getStore();
  const business = ok ? await store.getBusinessBySlug(slug) : null;
  if (!business) return new Response("Not found", { status: 404 });
  const today = nowInZone(business.timezone).date;
  const bookings = await store.listBookings(business.id, { from: addDays(today, -7), to: addDays(today, 60) });
  return new Response(buildIcs(business, bookings), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${slug}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
