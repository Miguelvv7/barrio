import Link from "next/link";
import { McpUrl } from "@/components/McpUrl";
import { Wordmark } from "@/components/Wordmark";
import { getBaseUrl, mcpUrl } from "@/lib/base-url";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const FEATURES = [
  {
    title: "Cards on Echo Show",
    body: "Every tool ships an MCP App: free times you can tap, dish details, booking confirmations — built to Amazon’s Alexa+ design guide.",
  },
  {
    title: "One add-on, every shop",
    body: "No barber will certify an Alexa+ add-on. Barrio’s directory endpoint puts every business behind a single one.",
  },
  {
    title: "Snap your menu",
    body: "Owners photograph the paper menu or price list; Barrio reads it and they tick what to publish.",
  },
  {
    title: "In the owner’s calendar",
    body: "Bookings land in the iPhone, Google or Outlook calendar they already use. Optional email alerts.",
  },
  {
    title: "Never guesses allergens",
    body: "Gluten-free only when the restaurant says so. Undeclared allergens? The assistant sends you to the staff.",
  },
  {
    title: "No double bookings",
    body: "100 people asking for the same slot at once get one booking and 99 alternatives — enforced inside Postgres.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "The owner fills in a form",
    body: "Services or menu, prices, opening hours, how many chairs or tables. Five minutes, no code.",
  },
  {
    n: "02",
    title: "Barrio hands back one URL",
    body: "A standards-based MCP server (Streamable HTTP, spec 2025-11-25) that speaks for that business.",
  },
  {
    n: "03",
    title: "Alexa+ takes it from there",
    body: "Through an Alexa+ add-on (or any MCP client), customers ask about the menu, check free times and book by voice. The owner sees it in the agenda.",
  },
];

export default async function Home() {
  // Only verified businesses: anyone can create a sandbox, and it mustn't show up as "live on Barrio".
  const [all, base] = await Promise.all([getStore().listBusinesses(), getBaseUrl()]);
  const businesses = all.filter((b) => b.trusted);

  return (
    <main className="relative overflow-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/dashboard" className="btn btn-ghost">
            Owner dashboard
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:pt-16">
        <div>
          <p className="rise mb-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft sm:text-xs sm:tracking-[0.14em]">
            <span className="size-1.5 rounded-full bg-terracota" /> Built for Alexa+ · for small businesses
          </p>
          <h1
            className="rise font-display text-[clamp(2.8rem,7vw,5.6rem)] font-medium leading-[1] tracking-[-0.02em]"
            style={{ animationDelay: "80ms" }}
          >
            Your <em className="text-terracota">neighbourhood</em>,
            <br />
            on Alexa+.
          </h1>
          <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-ink-soft" style={{ animationDelay: "160ms" }}>
            The barber round the corner and the Tex-Mex place on the high street don&apos;t have developers. Barrio
            gives them an AI-ready front desk in five minutes: an MCP server that an Alexa+ add-on — or any MCP
            client — uses to answer questions and take bookings for them.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: "240ms" }}>
            {businesses[0] && (
              <Link href={`/try/${businesses.find((b) => b.kind === "salon")?.slug ?? businesses[0].slug}`} className="btn btn-primary !px-5 !py-2.5">
                Try the voice demo →
              </Link>
            )}
            <Link href="/try/el-rancho/screens" className="btn !px-5 !py-2.5">
              See it on Echo Show
            </Link>
            <Link href="/dashboard/new" className="btn btn-ghost !px-5 !py-2.5">
              Add your business
            </Link>
          </div>
        </div>

        <div className="rise relative mx-2 sm:mx-0" style={{ animationDelay: "200ms" }} aria-hidden>
          <div className="azulejo absolute inset-0 rotate-3 rounded-lg border-[1.5px] border-ink" />
          <div className="rotulo relative -rotate-2 p-6">
            <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">customer → Alexa+</p>
            <p className="mt-3 font-display text-2xl leading-snug">“Can I get a haircut and beard trim tomorrow after five?”</p>
            <div className="my-5 h-px bg-line" />
            <p className="font-mono text-xs uppercase tracking-widest text-ink-soft">Alexa+ → Barrio MCP</p>
            <p className="mt-2 font-mono text-[13px] leading-relaxed">
              check_availability(<span className="text-azulejo">date</span>=&quot;tomorrow&quot;,{" "}
              <span className="text-azulejo">service</span>=&quot;corte y barba&quot;)
            </p>
            <div className="my-5 h-px bg-line" />
            <p className="font-display text-xl leading-snug text-terracota">
              “I have 17:15 free. Shall I book it under your name?”
            </p>
          </div>
        </div>
      </section>

      <div className="azulejo h-11 border-y-[1.5px] border-ink" aria-hidden />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-4xl font-medium tracking-tight">Live on Barrio</h2>
          <p className="max-w-md text-ink-soft">
            Two real businesses in Écija, Spain — my dad&apos;s restaurant and the barber I go to — with their published
            services, menu and prices, used with permission. Demo only: bookings made here aren&apos;t sent to them.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          {businesses.map((b, i) => (
            <article key={b.id} className="rotulo rise flex flex-col p-6" style={{ animationDelay: `${120 * i}ms` }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">
                    {b.kind === "salon" ? "Barber · appointments" : "Restaurant · tables & menu"}
                  </p>
                  <h3 className="mt-1.5 font-display text-3xl font-medium leading-tight">{b.name}</h3>
                </div>
                <span className="font-display text-5xl leading-none text-terracota" aria-hidden>
                  {b.kind === "salon" ? "✂" : "✶"}
                </span>
              </div>
              <p className="mt-3 text-ink-soft">{b.descriptionEn || b.description}</p>
              <p className="mt-2 text-sm text-ink-soft">{b.address}</p>
              <div className="mt-5">
                <McpUrl url={mcpUrl(base, b.slug)} compact />
              </div>
              <div className="mt-5 flex flex-wrap gap-2.5">
                <Link href={`/try/${b.slug}`} className="btn btn-primary">
                  Try it by voice
                </Link>
                <Link href={`/dashboard/${b.slug}`} className="btn btn-ghost">
                  Owner view
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <h2 className="font-display text-4xl font-medium tracking-tight">Built for Alexa+</h2>
        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-t-[1.5px] border-ink pt-4">
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{f.body}</p>
            </div>
          ))}
        </div>
        <div className="rotulo mt-12 grid gap-4 p-6 md:grid-cols-[1fr_1.4fr] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">Directory endpoint</p>
            <p className="mt-1 font-display text-2xl">Every business, one MCP server</p>
            <p className="mt-1 text-sm text-ink-soft">find_businesses + every tool with a business argument.</p>
          </div>
          <McpUrl url={`${base}/api/mcp`} />
        </div>
      </section>

      <section className="border-t-[1.5px] border-ink bg-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <p className="font-display text-6xl font-light text-albero">{s.n}</p>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-ink-soft sm:px-8">
        <span className="max-w-xl">
          Barrio — an independent project built for the Amazon Developer “Build, Ship, Shape” hackathon. Amazon, Alexa,
          Echo and all related marks are trademarks of Amazon.com, Inc. or its affiliates; Barrio isn&apos;t affiliated
          with or endorsed by Amazon.
        </span>
        <span className="flex gap-4">
          <a href="/privacy" className="hover:text-ink">Privacy</a>
          <a href="/terms" className="hover:text-ink">Terms</a>
          <span className="font-mono text-xs">MCP 2025-11-25 · Streamable HTTP</span>
        </span>
      </footer>
    </main>
  );
}
