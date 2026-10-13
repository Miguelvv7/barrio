/**
 * Optional OAuth 2.1 for the MCP endpoint, matching what the Alexa+ MCP Toolkit documents for
 * service-level (machine-to-machine) access to a private MCP server:
 *  - client_credentials grant at /api/oauth/token (client_secret_basic or client_secret_post);
 *  - Authorization Server Metadata (RFC 8414) at /.well-known/oauth-authorization-server;
 *  - Protected Resource Metadata (RFC 9728) at /.well-known/oauth-protected-resource[/api/mcp/<slug>];
 *  - unauthenticated / expired → 401 *without* a WWW-Authenticate header (Alexa+ doesn't support it).
 *
 * Modes (BARRIO_MCP_AUTH): "off" (default with no client configured), "optional" (default when a
 * client is configured: tokens are verified if sent, anonymous still works — handy for judges and
 * the MCP Inspector), "required" (private server: every request needs a valid token).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SCOPE = "mcp:service";
export const TOKEN_TTL_SECONDS = 3600;

export type AuthMode = "off" | "optional" | "required";

export function oauthClient(): { id: string; secret: string } | null {
  const id = process.env.BARRIO_OAUTH_CLIENT_ID;
  const secret = process.env.BARRIO_OAUTH_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export function authMode(): AuthMode {
  const configured = process.env.BARRIO_MCP_AUTH as AuthMode | undefined;
  if (!oauthClient()) return "off";
  return configured === "required" || configured === "off" ? configured : "optional";
}

function signingKey(): string {
  const key = process.env.BARRIO_OAUTH_SIGNING_SECRET || process.env.BARRIO_SECRET || oauthClient()?.secret;
  if (!key) throw new Error("No signing key configured");
  return key;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export interface TokenClaims {
  iss: string;
  sub: string;
  aud: string;
  scope: string;
  iat: number;
  exp: number;
}

export function issueToken(claims: Omit<TokenClaims, "iat" | "exp">, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + TOKEN_TTL_SECONDS }));
  const sig = createHmac("sha256", signingKey()).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** Returns the claims if the token is well-formed, signed by us, unexpired and meant for `resource`. */
export function verifyToken(token: string, resource: string, now = Math.floor(Date.now() / 1000)): TokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  let expected: string;
  try {
    expected = createHmac("sha256", signingKey()).update(`${header}.${payload}`).digest("base64url");
  } catch {
    return null;
  }
  if (!safeEqual(sig, expected)) return null;
  try {
    const h = JSON.parse(Buffer.from(header, "base64url").toString());
    if (h.alg !== "HS256") return null;
    const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenClaims;
    if (typeof c.exp !== "number" || c.exp <= now) return null;
    if (!c.scope?.split(" ").includes(SCOPE)) return null;
    // Audience: the whole MCP API or this exact endpoint (RFC 8707 resource indicators).
    const aud = c.aud.replace(/\/$/, "");
    const res = resource.replace(/\/$/, "");
    if (aud !== res && !res.startsWith(`${aud}/`)) return null;
    return c;
  } catch {
    return null;
  }
}

export function checkClient(id: string, secret: string): boolean {
  const client = oauthClient();
  if (!client) return false;
  return safeEqual(id, client.id) && safeEqual(secret, client.secret);
}

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    token_endpoint: `${base}/api/oauth/token`,
    grant_types_supported: ["client_credentials"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: [SCOPE],
    response_types_supported: [],
    // Listed because the Alexa+ toolkit checks for it; only relevant once user-level linking exists.
    code_challenge_methods_supported: ["S256"],
  };
}

export function protectedResourceMetadata(base: string, resourcePath = "/api/mcp") {
  return {
    resource: `${base}${resourcePath}`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Barrio MCP",
  };
}
