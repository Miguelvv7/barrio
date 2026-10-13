"use client";

/**
 * What Alexa+ shows on an Echo Show for each tool — live. A browser MCP client calls this business's
 * MCP server (tools/call + resources/read) and an MCP Apps host renders the server's own UI.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { EchoShow, type ScreenPayload } from "../EchoShow";

interface Shot extends ScreenPayload {
  title: string;
  note?: string;
}

export function ScreensGallery({ slug, name, kind }: { slug: string; name: string; kind: "salon" | "restaurant" }) {
  const [html, setHtml] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = new Client({ name: "barrio-screens", version: "1.0.0" });
      try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`/api/mcp/${slug}`, window.location.origin)));
        const { tools } = await client.listTools();
        const uiUri = (tools[0]?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
        if (!uiUri) throw new Error("This server has no MCP App");
        const read = await client.readResource({ uri: uiUri });
        const appHtml = (read.contents[0] as { text?: string }).text ?? "";

        const call = async (title: string, toolName: string, args: Record<string, unknown>, note?: string): Promise<Shot | null> => {
          const r = await client.callTool({ name: toolName, arguments: args });
          if (r.isError || !r.structuredContent) return null;
          return { title, toolName, arguments: args, structuredContent: r.structuredContent as Record<string, unknown>, note };
        };

        const info = await call("“When are you open?”", "get_business_info", {});
        const today = String((info?.structuredContent.local_now as { date?: string } | undefined)?.date ?? "");
        const list: (Shot | null)[] = [info];
        // First day in the next two weeks with free times.
        let avail: Shot | null = null;
        for (let i = 1; i <= 14 && !avail; i++) {
          const date = new Date(Date.parse(`${today}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
          const args = kind === "salon" ? { date, service: "haircut and beard trim" } : { date, party_size: 4 };
          const shot = await call(kind === "salon" ? "“Anything free for a haircut and beard trim?”" : "“A table for four?”", "check_availability", args);
          if (shot?.structuredContent.available) avail = shot;
        }
        if (kind === "salon") {
          list.push(await call("“How much is a haircut?”", "get_services", {}), avail);
        } else {
          list.push(
            await call("“What burgers do you have?”", "get_menu", { query: "hamburguesa" }),
            await call("“Is the guacamole gluten-free?”", "check_dish", { dish: "guacamole" }),
            await call("“And the Kansas burger?”", "check_dish", { dish: "burguer kansas" }),
            avail,
          );
        }
        const a = avail?.structuredContent;
        if (a) {
          // Example only — never written to the agenda.
          list.push({
            title: "“Book it.” — confirmation",
            note: "Example confirmation, not a real booking.",
            toolName: "create_booking",
            arguments: {},
            structuredContent: {
              view: "booking",
              message: "Example",
              booking: {
                reference: "K7Q3",
                business: name,
                address: String((info?.structuredContent as { address?: string } | undefined)?.address ?? ""),
                phone: String((info?.structuredContent as { phone?: string } | undefined)?.phone ?? ""),
                date: String(a.date),
                weekday: String(a.weekday),
                time: String((a.start_times as string[] | undefined)?.[0] ?? "17:00"),
                duration_minutes: Number(a.duration_minutes ?? 45),
                service: String(a.service),
                party_size: Number(a.party_size ?? 1),
                customer_name: "Lucía",
              },
            },
          });
        }
        if (!cancelled) {
          setHtml(appHtml);
          setShots(list.filter((s): s is Shot => Boolean(s)));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't reach the MCP server.");
      } finally {
        await client.close().catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, kind, name]);

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
          Each card below is live: this page calls the business&apos;s MCP server, reads its MCP App with{" "}
          <code className="font-mono text-sm">resources/read</code> and renders it the way Alexa+ does on an Echo Show —
          sandboxed, themed, scaled from Amazon&apos;s 768×480 base canvas. Tap a time or a dish: the card sends a message back
          to the host.
        </p>
        {said && (
          <p role="status" className="mt-4 inline-block rounded-md border-[1.5px] border-azulejo/40 bg-azulejo-soft px-3 py-1.5 text-sm">
            The card said: “{said}”
          </p>
        )}
        {error && <p role="alert" className="mt-6 text-danger">{error}</p>}
        {!error && shots.length === 0 && <p className="mt-10 text-ink-soft">Loading live screens…</p>}
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {html &&
            shots.map((s, i) => (
              <div key={i} data-testid="screen" data-view={String(s.structuredContent.view)}>
                <p className="mb-1 font-display text-xl">{s.title}</p>
                <p className="mb-3 font-mono text-xs text-ink-soft">
                  {s.toolName}
                  {s.note ? ` · ${s.note}` : ""}
                </p>
                <EchoShow html={html} payload={s} onUserMessage={setSaid} />
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
