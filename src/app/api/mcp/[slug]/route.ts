import type { NextRequest } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/handler";

// Node runtime: the in-memory store and crypto need it; MCP requests are short-lived.
export const runtime = "nodejs";
// Alexa+ calls from the US and expects < 500 ms round trips: run next to the database.
// Put the Supabase project in us-east-1 (N. Virginia) to match Vercel's iad1.
export const preferredRegion = "iad1";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/mcp/[slug]">;

async function handle(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  return handleMcpRequest(request, slug);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
