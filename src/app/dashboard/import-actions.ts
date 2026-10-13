"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canEdit } from "@/lib/auth";
import { DishDraft, extractCatalog, MAX_IMAGE_BYTES, MAX_TEXT_CHARS, ServiceDraft, sniffImage } from "@/lib/importer";
import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import { fold } from "@/lib/text";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ready"; kind: "salon" | "restaurant"; dishes: DishDraft[]; services: ServiceDraft[]; skipped: number };

async function editableBusiness(slug: string) {
  const business = await getStore().getBusinessBySlug(slug);
  if (!business || !(await canEdit(business.id))) return null;
  return business;
}

export async function extractCatalogAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const business = await editableBusiness(String(form.get("slug") ?? ""));
  if (!business) return { status: "error", message: "Read-only: log in as the owner to import." };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: "error", message: "Importing needs ANTHROPIC_API_KEY on the server." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (
    !rateLimit(`import:${business.id}`, 10, 60 * 60_000) ||
    !rateLimit(`import-ip:${ip}`, 10, 60 * 60_000) ||
    !rateLimit("import:global", business.trusted ? 200 : 60, 60 * 60_000)
  ) {
    return { status: "error", message: "Too many imports this hour — try again later." };
  }

  const file = form.get("photo");
  const text = String(form.get("menu_text") ?? "").trim().slice(0, MAX_TEXT_CHARS);
  let image: { mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMAGE_BYTES) return { status: "error", message: "That photo is too large (max 3.5 MB)." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mediaType = sniffImage(bytes);
    if (!mediaType) return { status: "error", message: "Use a JPEG, PNG or WebP photo." };
    image = { mediaType, base64: Buffer.from(bytes).toString("base64") };
  }
  if (!image && !text) return { status: "error", message: "Add a photo of your menu or paste its text." };

  try {
    const result = await extractCatalog({
      kind: business.kind,
      image,
      text: text || undefined,
      apiKey,
      model: process.env.IMPORT_MODEL || undefined,
    });
    const count = result.dishes.length + result.services.length;
    if (count === 0) return { status: "error", message: "Couldn't find any items with prices. Try a sharper, straighter photo." };
    return { status: "ready", kind: business.kind, ...result };
  } catch (error) {
    console.error(JSON.stringify({ evt: "import_error", tenant: business.slug, message: String(error) }));
    return { status: "error", message: "The reader is unavailable right now. Please try again." };
  }
}

export async function saveImportAction(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  const business = await editableBusiness(slug);
  if (!business) redirect(`/dashboard/${slug}?err=${encodeURIComponent("Read-only: log in as the owner to import.")}`);
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    raw = [];
  }
  const store = getStore();
  let added = 0;
  let skipped = 0;
  if (business.kind === "restaurant") {
    const items = z.array(DishDraft).max(150).safeParse(raw);
    if (!items.success) redirect(`/dashboard/${slug}?err=${encodeURIComponent("Nothing to import.")}#catalog`);
    const existing = new Set((await store.listMenu(business.id)).map((m) => fold(m.name)));
    for (const d of items.data) {
      if (existing.has(fold(d.name))) {
        skipped++;
        continue;
      }
      existing.add(fold(d.name));
      await store.saveMenuItem({
        businessId: business.id,
        category: d.category,
        name: d.name,
        description: d.description,
        price: d.price,
        glutenFree: d.gluten_free_stated ? true : null,
        allergens: [],
        allergensDeclared: false,
        available: true,
      });
      added++;
    }
  } else {
    const items = z.array(ServiceDraft).max(150).safeParse(raw);
    if (!items.success) redirect(`/dashboard/${slug}?err=${encodeURIComponent("Nothing to import.")}#catalog`);
    const existing = new Set((await store.listServices(business.id)).map((s) => fold(s.name)));
    for (const s of items.data) {
      if (existing.has(fold(s.name))) {
        skipped++;
        continue;
      }
      existing.add(fold(s.name));
      await store.saveService({
        businessId: business.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.duration_minutes,
        price: s.price,
        priceFrom: s.price_from,
        active: true,
        aliases: [],
      });
      added++;
    }
  }
  revalidatePath(`/dashboard/${slug}`);
  const note = skipped ? ` (${skipped} already on your list)` : "";
  redirect(`/dashboard/${slug}?msg=${encodeURIComponent(`Imported ${added} item${added === 1 ? "" : "s"}${note}. Check allergens for each dish.`)}#catalog`);
}
