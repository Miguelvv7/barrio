# Product feedback

> **DRAFT** — Devpost asks for feedback on every tool, API or SDK used. Edit to match your own experience.

## Model Context Protocol — Streamable HTTP, spec 2025-11-25

- **How I used it:** one stateless Streamable HTTP endpoint per business (`/api/mcp/<slug>`), JSON responses, tool annotations (`readOnlyHint`, `destructiveHint`), server `instructions`.
- **What worked:** the spec is precise about status codes (202, 400, 403, 404, 405, 406), which made it straightforward to test compliance. Tool annotations are a great fit for voice: the assistant knows which calls change data.
- **What needs work:** guidance for serverless/stateless deployments is thin compared with stateful SSE examples. An official "stateless server on Vercel/Lambda" example would save hours.
- **Onboarding:** good once you find the right transport class; finding it took reading type definitions.
- **Would I build with it again?** Yes.

## `@modelcontextprotocol/sdk` (TypeScript) 1.32.1

- **How I used it:** `McpServer.registerTool` with Zod schemas, `WebStandardStreamableHTTPServerTransport` (server), `StreamableHTTPClientTransport` and `InMemoryTransport` (tests, load test and the Alexa+ simulator).
- **What worked:** Zod v4 support, protocol-version and `Accept` validation built into the transport, an in-memory transport that makes testing trivial.
- **What needs work:** an empty JSON array body is accepted with `202`; the web-standard transport isn't featured in the README examples.
- **Would I build with it again?** Yes.

## Alexa+ (developer resources for the hackathon)

- **How I used it:** target platform for the MCP server; simulated through a web app as allowed by the track rules.
- **What needs work:** documentation on how Alexa+ discovers and authenticates against a self-hosted MCP server, and a way to test on a real device or simulator, would make the "real" integration path much clearer.
- **Would I build with it again?** Yes — especially with an official MCP connection guide.
