/** The simulator's MCP client must only ever connect to this deployment. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls: { mcpUrl?: string }[] = [];
vi.mock("@/lib/assistant", () => ({
  runAssistant: async (opts: { mcpUrl?: string }) => {
    calls.push(opts);
    return { reply: "ok", trace: [], transport: { kind: "in-process" } };
  },
}));

describe("POST /api/assistant/[slug]", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "x";
    process.env.BARRIO_SECRET = "k";
    calls.length = 0;
  });
  afterEach(() => {
    for (const k of ["ANTHROPIC_API_KEY", "BARRIO_SECRET", "BARRIO_PUBLIC_URL"]) delete process.env[k];
  });

  async function post(headers: Record<string, string>) {
    const { POST } = await import("@/app/api/assistant/[slug]/route");
    const { issuePageToken } = await import("@/lib/auth");
    const req = new NextRequest("https://barrio.test/api/assistant/la-familia", {
      method: "POST",
      headers: { origin: "https://barrio.test", "content-type": "application/json", "x-barrio-token": issuePageToken("la-familia"), ...headers },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    return POST(req, { params: Promise.resolve({ slug: "la-familia" }) } as never);
  }

  it("ignores X-Forwarded-Host when building the MCP URL", async () => {
    const res = await post({ "x-forwarded-host": "169.254.169.254", "x-forwarded-proto": "http" });
    expect(res.status).toBe(200);
    expect(calls[0].mcpUrl).toBe("https://barrio.test/api/mcp/la-familia");
  });

  it("uses the configured public URL when there is one", async () => {
    process.env.BARRIO_PUBLIC_URL = "https://barrio-blush.vercel.app";
    await post({});
    expect(calls[0].mcpUrl).toBe("https://barrio-blush.vercel.app/api/mcp/la-familia");
  });
});
