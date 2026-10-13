"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { DishDraft, ServiceDraft } from "@/lib/importer";
import { extractCatalogAction, saveImportAction, type ImportState } from "./import-actions";

/** Downscale in the browser so phone photos (often 4–8 MB) upload fast and fit serverless limits. */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size < 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

export function ImportPanel({ slug, kind }: { slug: string; kind: "salon" | "restaurant" }) {
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(extractCatalogAction, { status: "idle" });
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const items: (DishDraft | ServiceDraft)[] = useMemo(
    () => (state.status === "ready" ? (state.kind === "restaurant" ? state.dishes : state.services) : []),
    [state],
  );
  const selected = items.filter((_, i) => !unchecked.has(i));

  return (
    <div className="rotulo p-4">
      <h3 className="font-semibold">{kind === "restaurant" ? "Snap your menu" : "Snap your price list"}</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Take a photo of the paper {kind === "restaurant" ? "menu" : "price list"} (or paste its text). Barrio reads it and you
        choose what to add. Allergens are never read from photos — declare them yourself.
      </p>
      <form
        className="mt-3 grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const photo = form.get("photo");
          if (photo instanceof File && photo.size > 0) form.set("photo", await shrink(photo), "menu.jpg");
          setUnchecked(new Set());
          startTransition(() => dispatch(form));
        }}
      >
        <input type="hidden" name="slug" value={slug} />
        <input type="file" name="photo" accept="image/*" capture="environment" className="field" aria-label="Menu photo" />
        <textarea name="menu_text" rows={3} maxLength={20000} className="field" placeholder="…or paste the menu text here" />
        <button className="btn btn-primary justify-self-start" disabled={pending}>
          {pending ? "Reading your menu…" : "Read it"}
        </button>
      </form>
      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <form action={saveImportAction} className="mt-4 grid gap-2">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="items" value={JSON.stringify(selected)} />
          <p className="text-sm font-semibold">
            Found {items.length} item{items.length === 1 ? "" : "s"}
            {state.skipped ? ` (${state.skipped} unreadable, skipped)` : ""}. Untick anything that&apos;s wrong:
          </p>
          <ul className="max-h-80 divide-y divide-line overflow-auto rounded-md border-[1.5px] border-line bg-paper">
            {items.map((it, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!unchecked.has(i)}
                    onChange={() =>
                      setUnchecked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{it.name}</span>
                    {"category" in it && it.category && <span className="text-ink-soft"> · {it.category}</span>}
                    {"duration_minutes" in it && <span className="text-ink-soft"> · {it.duration_minutes} min</span>}
                    {it.description && <span className="block truncate text-ink-soft">{it.description}</span>}
                  </span>
                  {"gluten_free_stated" in it && it.gluten_free_stated && (
                    <span className="rounded-full bg-olivo/15 px-2 py-0.5 text-[11px] font-semibold text-olivo">GF</span>
                  )}
                  <span className="font-mono">
                    {"price_from" in it && it.price_from ? "from " : ""}
                    {it.price.toFixed(2)} €
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary justify-self-start" disabled={selected.length === 0}>
            Add {selected.length} item{selected.length === 1 ? "" : "s"}
          </button>
        </form>
      )}
    </div>
  );
}
