"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cancelReceipt } from "@/lib/auth";
import { BookingService } from "@/lib/booking-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export async function cancelByCustomerAction(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  const lang = form.get("lang") === "es" ? "&lang=es" : "";
  const reference = String(form.get("reference") ?? "").slice(0, 12);
  const phone = String(form.get("phone") ?? "").slice(0, 30);
  const back = (q: string) => redirect(`/cancel/${encodeURIComponent(slug)}?${q}${lang}`);
  const ip = clientIp(await headers());
  if (!rateLimit(`cancel:${ip}`, 10, 10 * 60_000)) back(`ref=${encodeURIComponent(reference)}&err=rate`);
  const business = await getStore().getBusinessBySlug(slug);
  if (!business) redirect("/");
  const result = await new BookingService(getStore()).cancelBooking(business, { reference, customer_phone: phone });
  if (!result.ok) return back(`ref=${encodeURIComponent(reference)}&err=nomatch`);
  const ref = result.reference;
  back(`done=${encodeURIComponent(ref)}&r=${cancelReceipt(slug, ref)}`);
}
