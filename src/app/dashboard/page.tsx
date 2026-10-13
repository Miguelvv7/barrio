import Link from "next/link";
import { McpUrl } from "@/components/McpUrl";
import { isAdmin, ownedBusinessIds } from "@/lib/auth";
import { getBaseUrl, mcpUrl } from "@/lib/base-url";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardIndex() {
  const [all, base, admin, owned] = await Promise.all([getStore().listBusinesses(), getBaseUrl(), isAdmin(), ownedBusinessIds()]);
  // Visitors see the verified businesses plus their own sandbox, never other visitors' sandboxes.
  const businesses = admin ? all : all.filter((b) => b.trusted || owned.includes(b.id));
  return (
    <>
      <h1 className="font-display text-5xl font-medium tracking-tight">Businesses</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Each business gets its own MCP server. Paste its URL into Alexa+ (or any MCP client) and customers can ask
        questions and book by voice.
      </p>
      <ul className="mt-10 grid gap-6 md:grid-cols-2">
        {businesses.map((b) => (
          <li key={b.id} className="rotulo p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">
              {b.kind === "salon" ? "Appointments" : "Restaurant"}
            </p>
            <Link href={`/dashboard/${b.slug}`} className="mt-1 block font-display text-2xl font-medium hover:text-terracota">
              {b.name} →
            </Link>
            <div className="mt-4">
              <McpUrl url={mcpUrl(base, b.slug)} compact />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
