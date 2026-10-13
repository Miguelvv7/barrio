# Barrio — your neighbourhood on Alexa+

[![CI](https://github.com/Miguelvv7/barrio/actions/workflows/ci.yml/badge.svg)](https://github.com/Miguelvv7/barrio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

![Barrio on Alexa+](docs/gallery/1-hero.png)

**Barrio gives small local businesses an MCP server in five minutes**, so Alexa+ can answer their customers' questions and take bookings for them — no developers, no code.

The barber round the corner and the Tex-Mex place on the high street will never build a voice integration, let alone get an Alexa+ add-on certified. With Barrio the owner fills in a form (or **takes a photo of the paper menu**) and gets a standards-based [MCP](https://modelcontextprotocol.io) server that speaks for the business — with **cards on Echo Show**, **bookings in the owner's phone calendar**, and **one Alexa+ add-on for every shop on the platform**.

> Built for the **Amazon Developer "Build, Ship, Shape" hackathon — Alexa+ track**, against Amazon's [Alexa+ MCP Toolkit](https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html) documentation.
> Running for two real businesses in Écija, Spain — **Peluquería La Familia** (barber) and **Restaurante El Rancho** (Tex-Mex) — with their own published services, menu and prices.

![Echo Show cards](docs/gallery/2-echo-show-cards.png)

---

## What it does

| For customers (via Alexa+) | For owners (dashboard) |
|---|---|
| "How much is a haircut and beard trim?" — English aliases for Spanish service names | **Snap your menu**: photo or pasted text → reviewed dishes/services |
| "Anything free tomorrow after five?" — tap a time on Echo Show to book it | Services/menu, prices, gluten-free and declared allergens |
| "Is the guacamole gluten-free?" — never guessed | Opening hours with split shifts, capacity (chairs/tables) |
| "A table for four on Friday at nine." — read back, booked only after a yes | Live agenda tagged **via Alexa+**; phone and walk-in bookings |
| Optional email confirmation with a self-service cancel link | **Calendar subscription** (iPhone/Google/Outlook) and email alerts |

## For Alexa+

Built to the toolkit's requirements — full checklist in [`alexa/README.md`](alexa/README.md):

- **Streamable HTTP, MCP 2025-11-25** (also negotiates 2025-06-18 and 2025-03-26, which Alexa+'s client sends), stateless so it scales on serverless.
- **Every tool declares an `outputSchema` and returns `structuredContent`** (Alexa+ renders native visuals from it), validated by the official MCP client in tests.
- **MCP Apps on Echo Show**: every tool links `ui://barrio/card-<hash>.html` (`text/html;profile=mcp-app`) — one self-contained 14 KB file, versioned by content hash, light/dark, authored on Amazon's 768×480 base canvas with their card tokens and type scale. Tapping a time sends `ui/message` back to Alexa.
- **"Still working" messages** via `_meta.ui.invoking` / `invoked`; tool annotations (`readOnlyHint`, `destructiveHint`…).
- **Under 500 ms**: ~5 ms server time, read-through cache for business/catalog data, `Server-Timing` header, MCP route pinned to `iad1`.
- **Optional OAuth 2.1** `client_credentials` with RFC 8414 + RFC 9728 metadata and bare `401`s, for a private-server add-on.
- **Store kit**: privacy policy, terms, icons in all six sizes, logos (SVG + PNG, light/dark), carousel and banner images — all generated from code (`npm run build:assets`), plus a listing generator that checks Amazon's field limits.

### Two endpoints

| Endpoint | What |
|---|---|
| `POST /api/mcp` | **Directory** — one server (one Alexa+ add-on) for every business: `find_businesses` + every tool with a `business` argument. "Alexa, ask Barrio for a haircut at La Familia." |
| `POST /api/mcp/<slug>` | One business's own server, for a business that wants its own add-on name. |

### Tools

| Tool | Salon | Restaurant | Notes |
|---|:-:|:-:|---|
| `find_businesses` | directory | directory | By need or name, English or Spanish ("barber", "tacos", "restaurante para cenar"). |
| `get_business_info` | ✓ | ✓ | Address, phone, hours, booking rules and the business's **local date/time** (resolves "next Friday"). |
| `get_services` | ✓ | | Duration, price, `price_is_minimum`, ids and English aliases. |
| `get_menu` | | ✓ | By category, searchable, accent-insensitive. |
| `check_dish` | | ✓ | Gluten-free only when the restaurant says so; allergens only when declared — otherwise "ask the staff". Ambiguous names ("ensalada") make it ask which one. |
| `check_availability` | ✓ | ✓ | Start times + compact ranges to read aloud; next free days when full or closed. |
| `create_booking` | ✓ | ✓ | Atomic capacity check; nearest alternatives if the slot was just taken; 4-character reference with no look-alike characters; optional email confirmation. |
| `cancel_booking` | ✓ | ✓ | Reference **and** phone; upcoming bookings only. |

Voice-friendly inputs: `today`, `tomorrow`, `mañana`, `this monday`, `el próximo viernes`; `17:30`, `5:30pm`, `1730`; "corte con barba" → *Corte y Barba*, "beard trim" → *Arreglo de barba*.

## Try it

- **Talk to it**: `/try/la-familia`, `/try/el-rancho` — a voice web app simulating Alexa+ (speech in/out, EN/ES). A Claude agent whose **only** tools are those it discovers from the business's MCP server; every reply shows its MCP calls, and the Echo Show panel renders the server's MCP App through the official MCP Apps host (`AppBridge`).
- **See the screens**: `/try/<slug>/screens` — each card live from the MCP server, no API key needed.
- **Owner view**: `/dashboard/<slug>` — read-only for visitors; create your own business at `/dashboard/new` and edit it.
- **MCP Inspector**: `npx @modelcontextprotocol/inspector` → Streamable HTTP → `https://<deployment>/api/mcp`.

## Architecture

```
Alexa+ / any MCP client ──POST──▶ /api/mcp            directory server (all businesses)
                          └─POST─▶ /api/mcp/<slug>     one business
                                        │
               McpServer: tools (outputSchema + structuredContent) · MCP App resource · profile resource
                                        │
                               BookingService ── availability.ts (pure booking rules)
                                        │                     └─ hooks → emails (after the response)
                   CachedStore ─ SupabaseStore ── Postgres: create_booking_atomic() (advisory lock)
                   MemoryStore (local dev / tests, zero config)

Owner   ─▶ /dashboard/<slug>   server actions · menu import (Claude vision) · calendar feed (.ics)
Visitor ─▶ /try/<slug>         voice UI → /api/assistant → Claude ⇄ in-memory MCP client
                               Echo Show panel = MCP Apps host (AppBridge) rendering the server's UI
```

**Stack:** Next.js 16 · TypeScript · `@modelcontextprotocol/sdk` 1.32 · `@modelcontextprotocol/ext-apps` (MCP Apps) · Supabase (Postgres) · Tailwind CSS 4 · Anthropic SDK · Vitest · Playwright.

## Reliability and security

- **No double bookings**: `create_booking_atomic()` takes a per-business advisory lock, re-counts overlapping bookings against capacity, enforces the per-phone limit and an hourly ceiling on assistant bookings (`max(20, capacity × 6)`) so a script with fake numbers can't fill weeks of agenda. Owner bookings are never blocked.
- **MCP endpoint**: `Origin` validation (403), CORS only for allowed origins, 64 KB body cap enforced while streaming, batches rejected, unsupported `MCP-Protocol-Version` → 400, Zod schemas with length limits everywhere.
- **Database**: Row Level Security on every table with no policies — the anon key reads nothing. Service-role key server-side only. Bookings deleted 12 months after the appointment (Vercel Cron).
- **Dashboard**: read-only for visitors with customer names reduced to initials; owner login (httpOnly cookie bound to the current password, constant-time checks, redirects limited to `/dashboard…`), fail-closed in production without a password; per-business ownership via HMAC-signed cookie; every server action re-checks permissions.
- **AI endpoints**: the simulator requires a same-site `Origin` and a short-lived signed page token, with per-IP and per-instance limits; menu import sniffs real image bytes, caps size, treats menu content as data, and never extracts allergens. Hard spend cap: the Anthropic console.
- **Emails**: HTML-escaped, sent after the response so they never touch Alexa+'s latency budget.

## Testing

```bash
npm test              # 175 unit, protocol, concurrency and fuzz tests (+9 Supabase tests when SUPABASE_TEST_* is set)
npm run typecheck && npm run lint
npm run test:sql      # DATABASE_URL=<disposable Postgres> — migration + 100 concurrent bookings
npm run test:e2e      # 60 browser checks (setup in e2e/run.mjs)
npm run load-test -- http://localhost:3000 la-familia
```

All of it runs in [CI](.github/workflows/ci.yml), including a real Postgres service and Chromium.

- **Protocol**: version negotiation, 202/405/403/406/400/413/404 behaviour, output schemas validated by the official client, MCP App resource, directory server; also checked with the official MCP Inspector CLI.
- **100 simultaneous customers**: one barber slot → exactly 1 booking and 99 alternatives; 100 table requests → exactly 8 (capacity); random chaos never overbooks; one phone spamming 50 parallel requests gets at most 3; hourly flood ceiling — in memory, on real PostgreSQL with 100 connections, and through PostgREST.
- **Fuzzing**: 3,000 calls with hostile inputs → never a 5xx, never a malformed booking.
- **Voice behaviour**: ambiguous dishes/services ask instead of guessing, English aliases, date/time phrases, DST in Madrid, lunch breaks, closing time, minimum notice, grid alignment.
- **Features**: OAuth (signature, expiry, audience, `alg:none`), calendar feed (UTC across DST, RFC 5545 escaping/folding), emails (escaping, failure isolation), menu import (sanitising, caps, magic-byte sniffing), retention, cache invalidation.
- **Browser**: onboarding a business and querying it over MCP, Echo Show cards rendered by the official host (including `ui/message` back from a tapped time), self-cancel, calendar feed, read-only mode and forged submissions, login/open-redirect attempts, no horizontal scroll at 375/768 px.

Load test (production build, one Node process): sequential round trips **p50 5 ms / p95 16 ms**; 2,000 calls with 100 in flight → **0 errors**, p50 ≈ 330 ms.

## Run it locally

```bash
npm install
npm run dev           # http://localhost:3000 — in-memory demo data, everyone is admin
```

`.env.local` with `ANTHROPIC_API_KEY` enables the voice simulator and menu import.

## Deploy (Vercel + Supabase)

1. Create a Supabase project in **us-east-1**. In the SQL editor, run `supabase/migrations/0001_barrio.sql`.
2. Copy `.env.example` to `.env.local`, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then `npm run seed`.
3. Import the repo in Vercel and set the variables from `.env.example` (at least `SUPABASE_*`, `BARRIO_ADMIN_PASSWORD`, `BARRIO_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`).
4. Deploy. MCP: `https://<project>.vercel.app/api/mcp` (all businesses) and `/api/mcp/<slug>`.
5. Publishing on Alexa+: [`alexa/README.md`](alexa/README.md).

## Data notes

- La Familia's services, prices, durations and hours and El Rancho's dishes, prices and gluten-free list come from each business's own website. El Rancho's opening hours aren't published online — the demo uses placeholder hours.
- Per-dish allergens are left undeclared for El Rancho because the restaurant doesn't publish them; the assistant says so instead of guessing.

## License

MIT © 2026 Miguel Victorio
