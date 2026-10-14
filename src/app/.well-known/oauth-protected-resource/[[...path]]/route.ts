import { getBaseUrl } from "@/lib/base-url";
import { oauthClient, protectedResourceMetadata } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** RFC 9728: /.well-known/oauth-protected-resource and the path-suffixed form for each MCP endpoint. */
export async function GET(_req: Request, ctx: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">) {
  if (!oauthClient()) return Response.json({ error: "oauth_not_configured" }, { status: 404 });
  const { path } = await ctx.params;
  const suffix = path?.length ? `/${path.map(encodeURIComponent).join("/")}` : "/api/mcp";
  if (!/^\/api\/mcp(?:\/[a-z0-9-]+)?$/.test(suffix)) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(protectedResourceMetadata(await getBaseUrl(), suffix), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
