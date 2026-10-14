import { getBaseUrl } from "@/lib/base-url";
import { checkClient, issueToken, oauthClient, SCOPE, TOKEN_TTL_SECONDS } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MCP_PATH = /^\/api\/mcp(?:\/[a-z0-9-]+)?$/;

function err(status: number, error: string, description?: string) {
  return Response.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}

/** OAuth 2.1 token endpoint — client_credentials only (service-level access for Alexa+). */
export async function POST(request: Request) {
  if (!oauthClient()) return err(404, "oauth_not_configured");
  const ip = clientIp(request.headers);
  if (!rateLimit(`oauth:${ip}`, 30, 60_000)) return err(429, "slow_down");

  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded")) {
    return err(400, "invalid_request", "Use application/x-www-form-urlencoded");
  }
  const form = new URLSearchParams((await request.text()).slice(0, 4096));
  if (form.get("grant_type") !== "client_credentials") return err(400, "unsupported_grant_type");

  let id = form.get("client_id") ?? "";
  let secret = form.get("client_secret") ?? "";
  const basic = request.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const decoded = Buffer.from(basic.slice(6), "base64").toString();
    const i = decoded.indexOf(":");
    if (i > 0) {
      try {
        id = decodeURIComponent(decoded.slice(0, i));
        secret = decodeURIComponent(decoded.slice(i + 1));
      } catch {
        return err(401, "invalid_client");
      }
    }
  }
  if (!checkClient(id, secret)) return err(401, "invalid_client");

  const requested = (form.get("scope") ?? SCOPE).split(" ").filter(Boolean);
  if (requested.some((s) => s !== SCOPE)) return err(400, "invalid_scope");

  const base = await getBaseUrl();
  const resource = form.get("resource") ?? `${base}/api/mcp`;
  // Exactly the directory endpoint or one business's: no "/api/mcp-other" or deeper paths.
  if (!resource.startsWith(base) || !MCP_PATH.test(resource.slice(base.length))) return err(400, "invalid_target");

  const token = issueToken({ iss: base, sub: id, aud: resource, scope: SCOPE });
  return Response.json(
    { access_token: token, token_type: "Bearer", expires_in: TOKEN_TTL_SECONDS, scope: SCOPE },
    { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  );
}
