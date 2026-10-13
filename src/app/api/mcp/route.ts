import type { NextRequest } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/handler";
import { emailHooks, publicBase } from "./[slug]/hooks";

/** Directory server: one MCP endpoint (and one Alexa+ add-on) in front of every business. */
export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const dynamic = "force-dynamic";

async function handle(request: NextRequest) {
  return handleMcpRequest(request, null, { hooks: emailHooks(publicBase(request.nextUrl.origin)) });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
