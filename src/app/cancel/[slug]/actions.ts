"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookingService } from "@/lib/booking-service";
import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export async function cancelByCustomerAction(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  const reference = String(form.get("reference") ?? "").slice(0, 12);
  const phone = String(form.get("phone") ?? "").slice(0, 30);
  const back = (q: string) => redirect(`/cancel/${encodeURIComponent(slug)}?${q}`);
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`cancel:${ip}`, 10, 10 * 60_000)) back(`ref=${encodeURIComponent(reference)}&err=rate`);
  const business = await getStore().getBusinessBySlug(slug);
  if (!business) redirect("/");
  const result = await new BookingService(getStore()).cancelBooking(business, { reference, customer_phone: phone });
  if (!result.ok) back(`ref=${encodeURIComponent(reference)}&err=nomatch`);
  back(`done=${encodeURIComponent(reference.toUpperCase())}`);
}
