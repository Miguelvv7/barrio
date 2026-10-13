# Product feedback

> **DRAFT** — Devpost asks for feedback on every tool, API or SDK used. Edit to match your own experience.

## Alexa+ MCP Toolkit (documentation)

- **How I used it:** as the requirements spec — latency budget, structured output, MCP Apps on Echo Show, OAuth metadata, store listing and asset sizes, design guide (768×480 canvas, card tokens, type scale).
- **What worked:** the design guide is unusually concrete (tokens, sizes, viewing distances), and the functional requirements read like a test plan — I turned most of them into automated tests.
- **What needs work:** link it from the hackathon resources page; clarify access for participants outside the US; reconcile the protocol version (2025-11-25 vs the `2025-03-26` initialize example) and where `_meta.ui` lives; publish example `hostContext` values (`deviceClass`) for Echo Show 8/15.
- **Would I build with it again?** Yes.

## Model Context Protocol — Streamable HTTP, spec 2025-11-25

- **How I used it:** stateless endpoints per business plus a directory endpoint; tools with input/output schemas and annotations; resources (MCP App + profile); server instructions.
- **What worked:** precise status-code rules made compliance testable; `outputSchema` + `structuredContent` is a great fit for voice-plus-screen.
- **What needs work:** an official stateless/serverless example.
- **Would I build with it again?** Yes.

## MCP Apps extension (`@modelcontextprotocol/ext-apps` 1.7)

- **How I used it:** `registerAppTool` / `registerAppResource` on the server; `AppBridge` + `PostMessageTransport` as the host in the simulator and the screens gallery.
- **What worked:** server helpers and the host bridge are clean; capability negotiation and host context are well designed.
- **What needs work:** the view-side `App` pulls in ~500 KB; a dependency-free view runtime would suit device webviews.
- **Would I build with it again?** Yes.

## `@modelcontextprotocol/sdk` (TypeScript) 1.32

- **How I used it:** `McpServer`, `WebStandardStreamableHTTPServerTransport`, `StreamableHTTPClientTransport`, `InMemoryTransport`.
- **What worked:** Zod v4 support, built-in protocol-version and `Accept` validation, in-memory transport for tests; the client validates `structuredContent` against `outputSchema` for free.
- **What needs work:** `[]` body → 202.
- **Would I build with it again?** Yes.
