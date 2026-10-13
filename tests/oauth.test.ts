/** Optional OAuth 2.1 (client_credentials) as documented for Alexa+ private MCP servers. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as tokenRoute } from "@/app/api/oauth/token/route";
import { GET as asMeta } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as prMeta } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { handleMcpRequest } from "@/lib/mcp/handler";
import { issueToken, verifyToken } from "@/lib/oauth";
import { BASE, rpc, setup } from "./helpers";

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } },
};

function form(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`${BASE}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(body).toString(),
  });
}

describe("OAuth (configured)", () => {
  beforeEach(() => {
    process.env.BARRIO_PUBLIC_URL = BASE;
    process.env.BARRIO_OAUTH_CLIENT_ID = "alexa";
    process.env.BARRIO_OAUTH_CLIENT_SECRET = "s3cret";
    process.env.BARRIO_SECRET = "signing-key";
  });
  afterEach(() => {
    for (const k of ["BARRIO_PUBLIC_URL", "BARRIO_OAUTH_CLIENT_ID", "BARRIO_OAUTH_CLIENT_SECRET", "BARRIO_SECRET", "BARRIO_MCP_AUTH"]) delete process.env[k];
  });

  it("publishes RFC 8414 and RFC 9728 metadata", async () => {
    const as = await (await asMeta()).json();
    expect(as.token_endpoint).toBe(`${BASE}/api/oauth/token`);
    expect(as.grant_types_supported).toEqual(["client_credentials"]);
    expect(as.code_challenge_methods_supported).toContain("S256");
    const pr = await (await prMeta(new Request(BASE), { params: Promise.resolve({ path: ["api", "mcp", "la-familia"] }) })).json();
    expect(pr.resource).toBe(`${BASE}/api/mcp/la-familia`);
    expect(pr.authorization_servers).toEqual([BASE]);
    const bad = await prMeta(new Request(BASE), { params: Promise.resolve({ path: ["etc", "passwd"] }) });
    expect(bad.status).toBe(404);
  });

  it("issues tokens via client_secret_basic and client_secret_post; rejects bad clients and grants", async () => {
    const basic = await tokenRoute(form({ grant_type: "client_credentials" }, { Authorization: `Basic ${Buffer.from("alexa:s3cret").toString("base64")}` }));
    expect(basic.status).toBe(200);
    const body = await basic.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(3600);
    expect(basic.headers.get("cache-control")).toBe("no-store");

    expect((await tokenRoute(form({ grant_type: "client_credentials", client_id: "alexa", client_secret: "s3cret" }))).status).toBe(200);
    expect((await tokenRoute(form({ grant_type: "client_credentials", client_id: "alexa", client_secret: "nope" }))).status).toBe(401);
    expect((await tokenRoute(form({ grant_type: "password", client_id: "alexa", client_secret: "s3cret" }))).status).toBe(400);
    expect((await tokenRoute(form({ grant_type: "client_credentials", client_id: "alexa", client_secret: "s3cret", scope: "admin" }))).status).toBe(400);
    expect((await tokenRoute(form({ grant_type: "client_credentials", client_id: "alexa", client_secret: "s3cret", resource: "https://evil.example/api/mcp" }))).status).toBe(400);
  });

  it("verifies signature, expiry, scope and audience", () => {
    const now = 2_000_000_000;
    const t = issueToken({ iss: BASE, sub: "alexa", aud: `${BASE}/api/mcp`, scope: "mcp:service" }, now);
    expect(verifyToken(t, `${BASE}/api/mcp/la-familia`, now + 10)).not.toBeNull();
    expect(verifyToken(t, `${BASE}/api/mcp/la-familia`, now + 3601)).toBeNull();
    expect(verifyToken(t, `https://other.example/api/mcp/la-familia`, now)).toBeNull();
    const narrow = issueToken({ iss: BASE, sub: "alexa", aud: `${BASE}/api/mcp/el-rancho`, scope: "mcp:service" }, now);
    expect(verifyToken(narrow, `${BASE}/api/mcp/la-familia`, now)).toBeNull();
    const [h, p] = t.split(".");
    expect(verifyToken(`${h}.${p}.forged`, `${BASE}/api/mcp/x`, now)).toBeNull();
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
    expect(verifyToken(none, `${BASE}/api/mcp/x`, now)).toBeNull();
  });

  it("optional mode: anonymous works, a bad token gets a bare 401", async () => {
    const { store, clock } = await setup();
    const anon = await handleMcpRequest(rpc("la-familia", INIT), "la-familia", { store, clock });
    expect(anon.status).toBe(200);
    const bad = await handleMcpRequest(rpc("la-familia", INIT, { Authorization: "Bearer nope" }), "la-familia", { store, clock });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toBeNull();
  });

  it("required mode: no token → 401, valid token → 200", async () => {
    process.env.BARRIO_MCP_AUTH = "required";
    const { store, clock } = await setup();
    expect((await handleMcpRequest(rpc("la-familia", INIT), "la-familia", { store, clock })).status).toBe(401);
    const res = await tokenRoute(form({ grant_type: "client_credentials", client_id: "alexa", client_secret: "s3cret" }));
    const { access_token } = await res.json();
    const ok = await handleMcpRequest(rpc("la-familia", INIT, { Authorization: `Bearer ${access_token}` }), "la-familia", { store, clock });
    expect(ok.status).toBe(200);
  });
});

describe("OAuth (not configured)", () => {
  it("endpoints answer 404 and the MCP endpoint ignores Authorization", async () => {
    expect((await asMeta()).status).toBe(404);
    expect((await tokenRoute(form({ grant_type: "client_credentials" }))).status).toBe(404);
    const { store, clock } = await setup();
    const r = await handleMcpRequest(rpc("la-familia", INIT, { Authorization: "Bearer whatever" }), "la-familia", { store, clock });
    expect(r.status).toBe(200);
  });
});
