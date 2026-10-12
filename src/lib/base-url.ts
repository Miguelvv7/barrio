import { headers } from "next/headers";

/** Public origin of this deployment, e.g. "https://barrio.vercel.app". */
export async function getBaseUrl(): Promise<string> {
  if (process.env.BARRIO_PUBLIC_URL) return process.env.BARRIO_PUBLIC_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function mcpUrl(base: string, slug: string) {
  return `${base}/api/mcp/${slug}`;
}
