# Friction log — Barrio (Alexa+ track)

> **DRAFT.** These are real friction points hit while building Barrio. Review, rewrite in your own
> words and add anything else you run into before submitting — the friction log can earn up to a
> 10% judging bonus, and it should reflect your experience.

| # | Where | What happened | Impact | Workaround |
|---|---|---|---|---|
| 1 | Hackathon resources page, Alexa+ section | It links the MCP 2025-11-25 transport spec and the MCP extensions guide, but doesn't explain how an Alexa+ agent discovers or connects to a self-hosted MCP server, what authentication it expects, or how to test against a real Alexa+ device or console. No Alexa+ sample repo is listed. | Couldn't verify the end-to-end path on a real device; had to design blind on auth and discovery. | Built a spec-compliant, unauthenticated Streamable HTTP server and a web-based Alexa+ simulator (allowed by the rules) that exercises it through a real MCP client. |
| 2 | "spec 2025-11-25 or later" requirement | Not obvious which SDK versions implement 2025-11-25. | Time spent checking. | Read `LATEST_PROTOCOL_VERSION` in `@modelcontextprotocol/sdk` (1.32.1 → `2025-11-25`) and added a test asserting the negotiated version. |
| 3 | Streamable HTTP on serverless | The common examples are stateful (session IDs, SSE). On Vercel, instances don't share memory, so sessions break. | Had to work out the stateless + JSON-response configuration from the SDK's type definitions. | `WebStandardStreamableHTTPServerTransport` with `sessionIdGenerator: undefined` and `enableJsonResponse: true`, one server per request; `405` for GET/DELETE. |
| 4 | MCP SDK edge case | Posting an empty JSON array (`[]`) to the transport returned `202 Accepted` instead of an error. | A malformed request looked successful. | Parse and validate the body before handing it to the SDK; reject arrays (batching was removed in 2025-06-18). |
| 5 | Origin validation (spec "MUST") vs browser tooling | Correct DNS-rebinding protection blocks browser-based MCP inspectors unless their origin is allow-listed. | Testing friction. | `BARRIO_ALLOWED_ORIGINS` env var; server-to-server clients (no `Origin`) always allowed. |
| 6 | AWS Builder mini challenge | AWS credit requests closed on 7 Oct 2026 because codes ran out. | Entering that mini challenge now means paying for AWS usage. | Entered the Open Source mini challenge instead. |
