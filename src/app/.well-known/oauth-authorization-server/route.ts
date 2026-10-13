import { getBaseUrl } from "@/lib/base-url";
import { authorizationServerMetadata, oauthClient } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!oauthClient()) return Response.json({ error: "oauth_not_configured" }, { status: 404 });
  return Response.json(authorizationServerMetadata(await getBaseUrl()), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
