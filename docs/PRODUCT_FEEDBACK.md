# Product feedback

> **DRAFT** — Devpost asks for feedback on every tool, API or SDK used: how you used it, what worked,
> what needs work, how onboarding went, and whether you'd build with it again. Edit to match your own
> experience — especially the onboarding lines.

## Alexa+ MCP Toolkit (documentation)

- **How I used it:** as the requirements spec — latency budget, structured output, MCP Apps on Echo Show, OAuth metadata, store listing and asset sizes, design guide (768×480 canvas, card tokens, type scale).
- **What worked:** the design guide is unusually concrete (tokens, sizes, viewing distances), and the functional requirements read like a test plan — I turned most of them into automated tests.
- **What needs work:** link it from the hackathon resources page; clarify access for participants outside the US; reconcile the protocol version (2025-11-25 vs the `2025-03-26` initialize example) and where `_meta.ui` lives; publish example `hostContext` values (`deviceClass`) for Echo Show 8/15.
- **Onboarding:** reading the docs was easy; the CLI, Local Inspector and web simulator aren't available to hackathon participants (per the FAQ), so I couldn't try them.
- **Would I build with it again?** Yes.

## Model Context Protocol — Streamable HTTP, spec 2025-11-25

- **How I used it:** stateless endpoints per business plus a directory endpoint; tools with input/output schemas and annotations; resources (MCP App + profile); server instructions.
- **What worked:** precise status-code rules made compliance testable; `outputSchema` + `structuredContent` is a great fit for voice-plus-screen.
- **What needs work:** an official stateless/serverless example.
- **Onboarding:** the spec is long but clear; the MCP Inspector made the first call quick.
- **Would I build with it again?** Yes.

## MCP Apps extension (`@modelcontextprotocol/ext-apps` 1.7)

- **How I used it:** `registerAppTool` / `registerAppResource` on the server; `AppBridge` + `PostMessageTransport` as the host in the simulator and the screens gallery.
- **What worked:** server helpers and the host bridge are clean; capability negotiation and host context are well designed.
- **What needs work:** the view-side `App` pulls in ~500 KB; a dependency-free view runtime would suit device webviews.
- **Onboarding:** the examples got a card on screen in an afternoon; the handshake timing with `srcdoc` took longer.
- **Would I build with it again?** Yes.

## `@modelcontextprotocol/sdk` (TypeScript) 1.32

- **How I used it:** `McpServer`, `WebStandardStreamableHTTPServerTransport`, `StreamableHTTPClientTransport`, `InMemoryTransport`.
- **What worked:** Zod v4 support, built-in protocol-version and `Accept` validation, in-memory transport for tests; the client validates `structuredContent` against `outputSchema` for free.
- **What needs work:** `[]` body → 202.
- **Onboarding:** smooth with TypeScript types as documentation.
- **Would I build with it again?** Yes.

## Anthropic API / SDK (Claude Haiku 5.5 and Sonnet 5.5)

- **How I used it:** the Alexa+ simulator (a Claude agent whose only tools are the business's MCP tools) and the menu-photo import (vision + structured outputs).
- **What worked:** tool use maps one-to-one onto MCP tools; structured outputs return valid JSON for the menu import; typed errors in the SDK.
- **What needs work:** model-specific breaking changes (forced `tool_choice` rejected, thinking on by default and counted in `max_tokens`) are easy to miss when tests use a fake client.
- **Onboarding:** an API key and a spend limit in the console, then a few lines of code.
- **Would I build with it again?** Yes.

## Next.js 16 · Vercel · Supabase · Resend

- **How I used them:** App Router pages, server actions and route handlers on Vercel (functions in `iad1`, a daily cron); Supabase Postgres with RLS and one SQL function for atomic bookings; Resend for confirmation emails.
- **What worked:** server actions for the owner dashboard; `after()` to send email without slowing the response; Postgres advisory locks for correctness.
- **What needs work:** generated route types that break `tsc` on a fresh clone; PostgREST's silent 1,000-row cap.
- **Onboarding:** quick for all of them (Vercel import + env vars, Supabase SQL editor).
- **Would I build with them again?** Yes.

## Web Speech API · Vitest · Playwright

- **How I used them:** speech in/out in the simulator; unit, protocol and fuzz tests; browser tests against the real build, including the official MCP Apps host.
- **What worked:** zero-dependency speech in Chrome and Safari; Playwright frame locators for sandboxed iframes.
- **What needs work:** speech recognition isn't in every browser, so the simulator also takes typing.
- **Would I build with them again?** Yes.

