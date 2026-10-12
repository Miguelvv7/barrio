export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      className={`rise mb-6 flex items-start gap-3 rounded-md border-[1.5px] px-4 py-3 text-sm font-medium ${
        err ? "border-danger/50 bg-danger/10 text-danger" : "border-ok/40 bg-ok/10 text-ok"
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
