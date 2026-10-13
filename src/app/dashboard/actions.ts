"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addOwnedBusiness, canEdit, isAdmin } from "@/lib/auth";
import { BookingService } from "@/lib/booking-service";
import { parseBusinessSettings, parseHours, parseMenuItem, parseNewBusiness, parseService } from "@/lib/forms";
import { rateLimit } from "@/lib/rate-limit";
import { DuplicateSlugError, getStore } from "@/lib/store";
import type { Business } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idFrom(form: FormData): string | null {
  const id = String(form.get("id") ?? "");
  return UUID_RE.test(id) ? id : null;
}

/** Public visitors can create sandbox businesses, but not unlimited ones. */
const MAX_BUSINESSES_FOR_PUBLIC = 40;

function back(slug: string, kind: "msg" | "err", text: string, anchor = ""): never {
  redirect(`/dashboard/${slug}?${kind}=${encodeURIComponent(text)}${anchor ? `#${anchor}` : ""}`);
}

async function loadEditable(form: FormData): Promise<Business> {
  const slug = String(form.get("slug") ?? "");
  const business = await getStore().getBusinessBySlug(slug);
  if (!business) redirect("/dashboard");
  if (!(await canEdit(business.id))) back(slug, "err", "Read-only: log in as the owner to make changes.");
  return business;
}

export async function createBusinessAction(form: FormData) {
  const parsed = parseNewBusiness(form);
  if (!parsed.ok) redirect(`/dashboard/new?err=${encodeURIComponent(parsed.error)}`);
  const store = getStore();
  const admin = await isAdmin();
  if (!admin) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`create-business:${ip}`, 3, 60 * 60_000)) {
      redirect(`/dashboard/new?err=${encodeURIComponent("You've created several businesses already — try again in an hour.")}`);
    }
  }
  if (!admin && (await store.listBusinesses()).length >= MAX_BUSINESSES_FOR_PUBLIC) {
    redirect(`/dashboard/new?err=${encodeURIComponent("The demo is full — no more businesses can be created right now.")}`);
  }
  let created: Business;
  try {
    created = await store.createBusiness({ ...parsed.data, trusted: admin });
  } catch (error) {
    if (error instanceof DuplicateSlugError) {
      redirect(`/dashboard/new?err=${encodeURIComponent(`"${parsed.data.slug}" is taken — choose another web address.`)}`);
    }
    throw error;
  }
  await addOwnedBusiness(created.id);
  revalidatePath("/");
  revalidatePath("/dashboard");
  back(created.slug, "msg", "Your business is live. Add your services or menu below, then share the MCP URL.");
}

export async function saveSettingsAction(form: FormData) {
  const business = await loadEditable(form);
  const parsed = parseBusinessSettings(form, business.kind);
  if (!parsed.ok) back(business.slug, "err", parsed.error, "settings");
  // Only the platform admin can turn on email notifications — otherwise anyone could create a
  // sandbox business and use Barrio to send mail to arbitrary addresses.
  const patch = { ...parsed.data };
  if (!(await isAdmin())) delete patch.notifyEmail;
  await getStore().updateBusiness(business.id, patch);
  revalidatePath(`/dashboard/${business.slug}`);
  back(business.slug, "msg", "Settings saved.", "settings");
}

export async function saveHoursAction(form: FormData) {
  const business = await loadEditable(form);
  const parsed = parseHours(form);
  if (!parsed.ok) back(business.slug, "err", parsed.error, "hours");
  await getStore().updateBusiness(business.id, { hours: parsed.data });
  revalidatePath(`/dashboard/${business.slug}`);
  back(business.slug, "msg", "Opening hours saved.", "hours");
}

export async function saveServiceAction(form: FormData) {
  const business = await loadEditable(form);
  const parsed = parseService(form);
  if (!parsed.ok) back(business.slug, "err", parsed.error, "catalog");
  try {
    const store = getStore();
    const current = parsed.data.id ? (await store.listServices(business.id)).find((s) => s.id === parsed.data.id) : undefined;
    await store.saveService({ ...parsed.data, aliases: parsed.data.aliases ?? current?.aliases ?? [], businessId: business.id });
  } catch {
    back(business.slug, "err", "That service no longer exists.", "catalog");
  }
  revalidatePath(`/dashboard/${business.slug}`);
  back(business.slug, "msg", `Saved “${parsed.data.name}”.`, "catalog");
}

export async function deleteServiceAction(form: FormData) {
  const business = await loadEditable(form);
  const id = idFrom(form);
  if (id) await getStore().deleteService(business.id, id);
  revalidatePath(`/dashboard/${business.slug}`);
  back(business.slug, "msg", "Service removed.", "catalog");
}

export async function saveMenuItemAction(form: FormData) {
  const business = await loadEditable(form);
  const parsed = parseMenuItem(form);
  if (!parsed.ok) back(business.slug, "err", parsed.error, "catalog");
  try {
    await getStore().saveMenuItem({ ...parsed.data, businessId: business.id });
  } catch {
    back(business.slug, "err", "That dish no longer exists.", "catalog");
  }
  revalidatePath(`/dashboard/${business.slug}`);
  back(business.slug, "msg", `Saved “${parsed.data.name}”.`, "catalog");
}

export async function deleteMenuItemAction(form: FormData) {
  const business = await loadEditable(form);
  const id = idFrom(form);
  if (id) await getStore().deleteMenuItem(business.id, id);
  revalidatePath(`/dashboard/${business.slug}`);
  back(business.slug, "msg", "Dish removed.", "catalog");
}

export async function cancelBookingAction(form: FormData) {
  const business = await loadEditable(form);
  const id = idFrom(form);
  const cancelled = id ? await getStore().cancelBookingById(business.id, id) : null;
  revalidatePath(`/dashboard/${business.slug}`);
  back(
    business.slug,
    cancelled ? "msg" : "err",
    cancelled ? `Booking ${cancelled.reference} cancelled.` : "That booking was already cancelled.",
    "agenda",
  );
}

export async function addBookingAction(form: FormData) {
  const business = await loadEditable(form);
  const get = (k: string) => String(form.get(k) ?? "");
  const partyRaw = get("party_size").trim();
  const party = partyRaw === "" ? undefined : Number(partyRaw);
  const result = await new BookingService(getStore()).createBooking(
    business,
    {
      date: get("date"),
      time: get("time"),
      service: get("service") || undefined,
      party_size: party,
      customer_name: get("customer_name"),
      customer_phone: get("customer_phone"),
      notes: get("notes"),
    },
    "dashboard",
  );
  revalidatePath(`/dashboard/${business.slug}`);
  if (!result.ok) {
    const alt = Array.isArray(result.alternatives) && result.alternatives.length ? ` Free nearby: ${result.alternatives.join(", ")}.` : "";
    back(business.slug, "err", `${result.error}${alt}`, "agenda");
  }
  back(business.slug, "msg", `Booked — reference ${String(result.booking.reference)}.`, "agenda");
}
