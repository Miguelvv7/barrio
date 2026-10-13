/**
 * Streamable HTTP endpoint (MCP spec 2025-11-25), stateless: every POST gets a fresh server and
 * transport, which suits serverless hosting (Vercel) — no sticky sessions needed.
 *
 *  - POST  → JSON-RPC request/notification (JSON responses; SSE not needed for these tools)
 *  - GET   → 405 (no server-initiated stream is offered — allowed by the spec)
 *  - DELETE→ 405 (stateless: there are no sessions to terminate)
 *  - Origin header present but not allowed → 403 (DNS-rebinding protection, spec "MUST")
 *  - Unsupported MCP-Protocol-Version → 400, wrong Accept → 406 (enforced by the SDK transport)
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { BookingService, type Clock } from "../booking-service";
import { authMode, verifyToken } from "../oauth";
import { getStore, type Store } from "../store";
import { buildMcpServer } from "./server";

export const MAX_BODY_BYTES = 64 * 1024;

const CORS_ALLOW_HEADERS =
  "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID";

function jsonRpcError(status: number, code: number, message: string, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function isLocalOrigin(origin: URL) {
  return origin.hostname === "localhost" || origin.hostname === "127.0.0.1" || origin.hostname === "[::1]";
}

/**
 * Server-to-server MCP clients (Alexa+, Claude, agents) send no Origin and are always allowed.
 * Browsers must come from this deployment, an allow-listed origin, or localhost outside production.
 */
export function isAllowedOrigin(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader) return true;
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }
  if (origin.host === new URL(requestUrl).host) return true;
  const allowList = (process.env.BARRIO_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowList.includes(origin.origin)) return true;
  return process.env.NODE_ENV !== "production" && isLocalOrigin(origin);
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version, Server-Timing",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

const TOO_LARGE = Symbol("too-large");

/** Reads the body as text, refusing early once it exceeds `max` bytes (with or without Content-Length). */
async function readBodyCapped(request: Request, max: number): Promise<string | typeof TOO_LARGE> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > max) return TOO_LARGE;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export interface HandlerDeps {
  store?: Store;
  clock?: Clock;
}

export async function handleMcpRequest(request: Request, slug: string, deps: HandlerDeps = {}): Promise<Response> {
  const startedAt = performance.now();
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin, request.url)) {
    return jsonRpcError(403, -32000, "Forbidden: origin not allowed");
  }
  const cors = corsHeaders(origin);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") {
    return jsonRpcError(405, -32000, "Method not allowed: this MCP endpoint is stateless and accepts POST only", {
      Allow: "POST, OPTIONS",
      ...cors,
    });
  }

  // OAuth (optional): Alexa+ wants a bare 401 — no WWW-Authenticate — for missing/invalid tokens.
  const mode = authMode();
  if (mode !== "off") {
    const header = request.headers.get("authorization");
    const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
    const resource = new URL(request.url).origin + new URL(request.url).pathname;
    if (bearer ? !verifyToken(bearer, resource) : mode === "required") {
      return jsonRpcError(401, -32001, "Unauthorized", cors);
    }
  }

  const body = await readBodyCapped(request, MAX_BODY_BYTES);
  if (body === TOO_LARGE) return jsonRpcError(413, -32000, "Payload too large", cors);
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body);
  } catch {
    return jsonRpcError(400, -32700, "Parse error: body must be a single JSON-RPC message", cors);
  }
  if (Array.isArray(parsedBody)) {
    // JSON-RPC batching was removed from MCP in 2025-06-18; one message per POST.
    return jsonRpcError(400, -32600, "Invalid request: batching is not supported", cors);
  }
  if (typeof parsedBody !== "object" || parsedBody === null) {
    return jsonRpcError(400, -32600, "Invalid request", cors);
  }

  const store = deps.store ?? getStore();
  let business;
  try {
    business = await store.getBusinessBySlug(slug);
  } catch (error) {
    console.error(JSON.stringify({ evt: "mcp_store_error", tenant: slug, message: String(error) }));
    return jsonRpcError(503, -32603, "Service temporarily unavailable", cors);
  }
  if (!business) return jsonRpcError(404, -32001, `Unknown business "${slug}"`, cors);

  const server = buildMcpServer(business, new BookingService(store, deps.clock));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_BODY_BYTES,
  });

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    headers.set("Server-Timing", `mcp;dur=${(performance.now() - startedAt).toFixed(1)}`);
    headers.set("Cache-Control", "no-store");
    const body = await response.arrayBuffer();
    return new Response(body.byteLength ? body : null, { status: response.status, headers });
  } catch (error) {
    console.error(JSON.stringify({ evt: "mcp_error", tenant: slug, message: String(error) }));
    return jsonRpcError(500, -32603, "Internal error", cors);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
