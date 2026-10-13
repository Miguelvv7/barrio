import { headers } from "next/headers";

/**
 * The deployment's public origin when it is known from configuration: BARRIO_PUBLIC_URL, or on
 * Vercel production the project's own domain. Never a Host header, which any caller can set.
 */
export function configuredBaseUrl(): string | undefined {
  const explicit = process.env.BARRIO_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined;
  return vercel ? `https://${vercel}` : undefined;
}

/** Public origin, e.g. "https://barrio.vercel.app" — from configuration, else from the request. */
export function baseUrlFrom(h: Headers): string {
  const configured = configuredBaseUrl();
  if (configured) return configured;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function getBaseUrl(): Promise<string> {
  return configuredBaseUrl() ?? baseUrlFrom(await headers());
}

export function mcpUrl(base: string, slug: string) {
  return `${base}/api/mcp/${slug}`;
}
