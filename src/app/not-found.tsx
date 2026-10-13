import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Wordmark />
        <div className="rotulo mt-8 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">404</p>
          <h1 className="mt-1 font-display text-3xl font-medium">This street isn&apos;t on the map</h1>
          <p className="mt-3 text-ink-soft">The page or business you&apos;re looking for doesn&apos;t exist (or has moved).</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/" className="btn btn-primary">
              Back to Barrio
            </Link>
            <Link href="/try/la-familia" className="btn btn-ghost">
              Try the voice demo
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
