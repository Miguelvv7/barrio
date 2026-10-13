"use client";

import { useEffect, useState } from "react";

/**
 * Result of a form action. `floating` pins it to the bottom of the screen — long pages redirect back
 * to the section that was saved, far below the top — and success messages fade after a few seconds
 * so they never sit on top of the next control. Give it a fresh `key` per request so a repeated
 * message shows again.
 */
export function Flash({ msg, err, floating = false }: { msg?: string; err?: string; floating?: boolean }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!floating || err) return;
    const t = setTimeout(() => setOpen(false), 5000);
    return () => clearTimeout(t);
  }, [msg, err, floating]);
  if ((!msg && !err) || !open) return null;
  const box = (
    <div
      role={err ? "alert" : "status"}
      className={`rise flex items-start gap-3 rounded-md border-[1.5px] px-4 py-3 text-sm font-medium ${
        err ? "border-danger/50 text-danger" : "border-ok/40 text-ok"
      } ${floating ? "pointer-events-auto bg-paper shadow-[4px_4px_0_var(--ink)]" : `mb-6 ${err ? "bg-danger/10" : "bg-ok/10"}`}`}
    >
      <span aria-hidden>{err ? "!" : "✓"}</span>
      <span className="flex-1">{err ?? msg}</span>
      {floating && (
        <button type="button" onClick={() => setOpen(false)} className="-my-1 px-1 text-lg leading-none opacity-70 hover:opacity-100" aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
  return floating ? <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg">{box}</div> : box;
}
