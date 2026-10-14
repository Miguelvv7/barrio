/** Hardening from the pre-submission security pass: each test fails without its fix. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as tokenRoute } from "@/app/api/oauth/token/route";
import { GET as prMeta } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { issuePageToken, verifyPageToken } from "@/lib/auth";
import { parseNewBusiness } from "@/lib/forms";
import { clientIp } from "@/lib/rate-limit";
import { BASE, setup } from "./helpers";

describe("client IP for rate limits", () => {
  it("prefers the platform's headers over a client-written X-Forwarded-For", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4", "x-real-ip": "1.2.3.4" });
    expect(clientIp(h)).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "9.9.9.9", "x-forwarded-for": "6.6.6.6" }))).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.5.5.5, 1.1.1.1" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers())).toBe("local");
  });
});

describe("/try page tokens", () => {
  beforeEach(() => void (process.env.BARRIO_SECRET = "k"));
  afterEach(() => void delete process.env.BARRIO_SECRET);

  it("accept a token issued by an instance whose clock runs a little ahead", () => {
    const issuedAt = 1_000_000_000_000;
    const token = issuePageToken("la-familia", issuedAt + 5_000);
    expect(verifyPageToken("la-familia", token, issuedAt)).toBe(true);
  });

  it("still refuse expired tokens, tokens from far in the future, and other businesses", () => {
    const now = 1_000_000_000_000;
    expect(verifyPageToken("la-familia", issuePageToken("la-familia", now - 3 * 60 * 60_000), now)).toBe(false);
    expect(verifyPageToken("la-familia", issuePageToken("la-familia", now + 10 * 60_000), now)).toBe(false);
    expect(verifyPageToken("el-rancho", issuePageToken("la-familia", now), now)).toBe(false);
  });
});

describe("OAuth resource indicators", () => {
  beforeEach(() => {
    process.env.BARRIO_PUBLIC_URL = BASE;
    process.env.BARRIO_OAUTH_CLIENT_ID = "alexa";
    process.env.BARRIO_OAUTH_CLIENT_SECRET = "s3cret";
    process.env.BARRIO_SECRET = "signing-key";
  });
  afterEach(() => {
    for (const k of ["BARRIO_PUBLIC_URL", "BARRIO_OAUTH_CLIENT_ID", "BARRIO_OAUTH_CLIENT_SECRET", "BARRIO_SECRET"]) delete process.env[k];
  });
  const token = (resource: string) =>
    tokenRoute(
      new Request(`${BASE}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: "alexa", client_secret: "s3cret", resource }).toString(),
      }),
    );

  it("issue tokens only for the directory or one business endpoint", async () => {
    expect((await token(`${BASE}/api/mcp`)).status).toBe(200);
    expect((await token(`${BASE}/api/mcp/la-familia`)).status).toBe(200);
    for (const bad of [`${BASE}/api/mcp-other`, `${BASE}/api/mcp/la-familia/../../admin`, `${BASE}/api/mcp/a/b`, `${BASE}.evil.example/api/mcp`]) {
      expect((await token(bad)).status, bad).toBe(400);
    }
  });

  it("publish protected-resource metadata only for real MCP paths", async () => {
    const meta = (path: string[]) => prMeta(new Request(BASE), { params: Promise.resolve({ path }) } as never);
    expect((await meta(["api", "mcp", "el-rancho"])).status).toBe(200);
    expect((await meta(["api", "mcp-other"])).status).toBe(404);
    expect((await meta(["api", "mcp", "a", "b"])).status).toBe(404);
  });
});

describe("business web addresses", () => {
  it("can't take a name the app uses for its own routes", () => {
    for (const slug of ["cancel", "privacy", "terms", "directory", "calendar", "assistant"]) {
      const f = new FormData();
      for (const [k, v] of Object.entries({ kind: "salon", name: "Shop", description: "x", phone: "600111222", address: "Calle 1", slug })) f.set(k, v);
      const r = parseNewBusiness(f);
      expect(r.ok, slug).toBe(false);
    }
  });
});

describe("cancellation", () => {
  it("rejects an implausible phone before looking anything up", async () => {
    const { service, salon } = await setup();
    const r = await service.cancelBooking(salon, { reference: "K7Q3", customer_phone: "abc" });
    expect(r).toMatchObject({ ok: false, code: "invalid_phone" });
  });
});

describe("next available days", () => {
  it("only reads the fortnight it looks at, not the whole future agenda", async () => {
    const { service, salon, store, clock } = await setup();
    clock.set("2026-10-19", "17:40");
    const filters: unknown[] = [];
    const inner = store.listBookings.bind(store);
    store.listBookings = async (id, filter) => {
      filters.push(filter);
      return inner(id, filter);
    };
    const r = await service.checkAvailability(salon, { date: "today", service: "Corte y Barba" });
    expect(r.ok && r.available).toBe(false);
    expect(filters).toContainEqual({ from: "2026-10-19", to: "2026-11-02" });
  });
});

describe("tool errors and the card", () => {
  it("errors link the card (so it can show 'which one?') but never claim success", async () => {
    const { store, clock } = await setup();
    const { connectClient } = await import("./helpers");
    for (const slug of ["la-familia", null]) {
      const c = await connectClient(slug, store, clock);
      const r = (await c.callTool({
        name: "create_booking",
        arguments: {
          ...(slug ? {} : { business: "la-familia" }),
          date: "2026-10-19",
          time: "03:00",
          service: "Corte y Barba",
          customer_name: "Ana",
          customer_phone: "600111222",
        },
      })) as { isError?: boolean; _meta?: { ui?: Record<string, unknown> } };
      expect(r.isError).toBe(true);
      expect(r._meta?.ui?.resourceUri).toMatch(/^ui:\/\//);
      expect(r._meta?.ui).not.toHaveProperty("invoked");
      await c.close();
    }
  });
});

describe("alexa/SKILL.md", () => {
  it("has skill frontmatter and only names tools the server really has", async () => {
    const { readFileSync } = await import("node:fs");
    const md = readFileSync("alexa/SKILL.md", "utf8");
    expect(md).toMatch(/^---\nname: barrio-local-bookings\ndescription: .{20,1024}\n---\n/);
    const { store, clock } = await setup();
    const { connectClient } = await import("./helpers");
    const c = await connectClient(null, store, clock);
    const tools = new Set((await c.listTools()).tools.map((t) => t.name));
    await c.close();
    const named = [...md.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((m) => m[1]).filter((n) => !/^(slot_|too_many|business_amb|next_av|party_size)/.test(n));
    expect(named.length).toBeGreaterThan(5);
    for (const n of named) expect(tools, n).toContain(n);
  });
});
