import type { NextRequest } from "next/server";
import { z } from "zod";
import { runAssistant } from "@/lib/assistant";
import { verifyPageToken } from "@/lib/auth";
import { baseUrlFrom, mcpUrl } from "@/lib/base-url";
import { authMode } from "@/lib/oauth";
import { rateLimit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  lang: z.enum(["en", "es"]).default("en"),
  knownUiUris: z.array(z.string().max(200)).max(10).default([]),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(30)
    .refine((m) => m[m.length - 1].role === "user", "Last message must be from the user")
    .refine((m) => m.reduce((n, x) => n + x.content.length, 0) <= 12_000, "Conversation too long — start over"),
});

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/assistant/[slug]">) {
  const { slug } = await ctx.params;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(503, { error: "not_configured", message: "Set ANTHROPIC_API_KEY to enable the voice simulator." });
  }

  // Paid endpoint: only our own /try page may call it. Browsers always send Origin on POST, and the
  // page embeds a short-lived signed token. (Hard spend caps belong in the Anthropic console.)
  const origin = request.headers.get("origin");
  let originHost = "";
  try {
    originHost = origin ? new URL(origin).host : "";
  } catch {
    /* invalid origin */
  }
  if (originHost !== request.nextUrl.host || !verifyPageToken(slug, request.headers.get("x-barrio-token"))) {
    return json(403, { error: "forbidden", message: "Reload the page and try again." });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`assistant:${ip}`, 40, 10 * 60_000) || !rateLimit("assistant:global", 600, 60 * 60_000)) {
    return json(429, { error: "rate_limited", message: "Too many requests — try again in a few minutes." });
  }

  let parsed;
  try {
    parsed = Body.safeParse(await request.json());
  } catch {
    return json(400, { error: "bad_request" });
  }
  if (!parsed.success) return json(400, { error: "bad_request", message: parsed.error.issues[0]?.message });

  const store = getStore();
  const business = await store.getBusinessBySlug(slug);
  if (!business) return json(404, { error: "not_found" });

  try {
    const result = await runAssistant({
      business,
      store,
      messages: parsed.data.messages,
      lang: parsed.data.lang,
      knownUiUris: parsed.data.knownUiUris,
      apiKey,
      model: process.env.ASSISTANT_MODEL || undefined,
      // Like Alexa+: a real MCP client over Streamable HTTP to this business's public endpoint.
      // (A private server — BARRIO_MCP_AUTH=required — is reached in-process instead.)
      mcpUrl: authMode() === "required" ? undefined : mcpUrl(baseUrlFrom(request.headers), business.slug),
    });
    return json(200, result);
  } catch (error) {
    console.error(JSON.stringify({ evt: "assistant_error", tenant: slug, message: String(error) }));
    return json(502, { error: "upstream", message: "The assistant is unavailable right now. Please try again." });
  }
}
