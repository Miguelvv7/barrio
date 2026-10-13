/**
 * Result of a form action. `floating` pins it to the bottom of the screen: long pages redirect back
 * to the section that was saved, far below the top of the page.
 */
export function Flash({ msg, err, floating = false }: { msg?: string; err?: string; floating?: boolean }) {
  if (!msg && !err) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      className={`rise flex items-start gap-3 rounded-md border-[1.5px] px-4 py-3 text-sm font-medium ${
        err ? "border-danger/50 text-danger" : "border-ok/40 text-ok"
      } ${
        floating
          ? "fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg bg-paper shadow-[4px_4px_0_var(--ink)]"
          : `mb-6 ${err ? "bg-danger/10" : "bg-ok/10"}`
      }`}
    >
      <span aria-hidden>{err ? "!" : "✓"}</span>
      <span>{err ?? msg}</span>
    </div>
  );
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
