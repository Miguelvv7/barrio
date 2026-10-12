import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="Barrio home">
      <span aria-hidden className="azulejo block size-7 rounded-[4px] border-[1.5px] border-ink [--tile:28px] transition-transform group-hover:rotate-45" />
      <span className="font-display text-2xl font-semibold tracking-tight">Barrio</span>
    </Link>
  );
}
