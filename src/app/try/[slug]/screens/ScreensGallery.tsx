"use client";

/** Renders each live MCP result with the server's own MCP App, through the official MCP Apps host. */
import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import type { Shot } from "@/lib/screens";
import { EchoShow } from "../EchoShow";

export function ScreensGallery({ slug, name, html, shots }: { slug: string; name: string; html: string; shots: Shot[] }) {
  // What a tapped card sent back to the host, shown under that card (not at the top of the page).
  const [said, setSaid] = useState<{ index: number; text: string } | null>(null);
  // The host's locale: the cards' labels follow it, the business's own words don't change.
  const [lang, setLang] = useState<"en" | "es">("en");
  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Wordmark />
        <div className="flex gap-2 text-sm">
          <Link href={`/try/${slug}`} className="btn btn-primary !py-1.5">
            Talk to it →
          </Link>
          <Link href={`/dashboard/${slug}`} className="btn btn-ghost !py-1.5">
            Owner view
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">MCP Apps · Alexa+ on Echo Show</p>
        <h1 className="mt-2 font-display text-4xl font-medium tracking-tight sm:text-5xl">{name}, on screen</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Each card below is live: an MCP client calls this business&apos;s MCP server, reads its MCP App with{" "}
          <code className="font-mono text-sm">resources/read</code>, and the official MCP Apps host renders it the way Alexa+
          does on an Echo Show — sandboxed, themed, scaled from Amazon&apos;s 768×480 base canvas. Tap a time or a dish: the
          card sends a message back to the host.
        </p>
        <div className="mt-5 flex items-center gap-3 text-sm">
          <span className="text-ink-soft">Host locale</span>
          <div role="group" aria-label="Host locale" className="flex rounded-full border-[1.5px] border-ink/15 p-0.5 text-xs">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`rounded-full px-3 py-1 font-semibold uppercase ${lang === l ? "bg-ink text-cal" : "text-ink-soft"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {shots.map((s, i) => (
            <div key={i} data-testid="screen" data-view={s.isError ? "choice" : String(s.structuredContent.view)}>
              <p className="mb-1 font-display text-xl">{s.title}</p>
              <p className="mb-3 font-mono text-xs text-ink-soft">
                {s.toolName}
                {s.note ? ` · ${s.note}` : ""}
              </p>
              <EchoShow html={html} payload={s} locale={lang === "es" ? "es-ES" : "en-US"} onUserMessage={(text) => setSaid({ index: i, text })} />
              {said?.index === i && (
                <p role="status" className="mt-3 inline-block rounded-md border-[1.5px] border-azulejo/40 bg-azulejo-soft px-3 py-1.5 text-sm">
                  Sent to Alexa+: “{said.text}”
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
