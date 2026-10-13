# Friction log — Barrio (Alexa+ track)

> **DRAFT.** Real friction points hit while building Barrio. Review, rewrite in your own words and add
> anything else you run into — the friction log can earn up to a 10% judging bonus and should reflect
> your experience.

| # | Where | What happened | Impact | Workaround |
|---|---|---|---|---|
| 1 | Hackathon resources page, Alexa+ section | It links the MCP 2025-11-25 transport spec and the MCP Apps extension, but not Amazon's own **Alexa+ MCP Toolkit** docs (quickstart, design guide, functional requirements). Found them only through a web search. | Days of building without the real requirements (500 ms budget, `structuredContent`, MCP Apps on Echo Show, bare 401s, store assets). | Read the toolkit docs end to end and rebuilt against them; checklist in `alexa/README.md`. |
| 2 | Toolkit access | The development-environment page assumes an AWS account "given to your Alexa Solutions Architect", a private CodeArtifact npm registry for `@alexa-ai/*`, a US marketplace and Node 24. Not obvious whether hackathon participants (here: Spain) get access. | Couldn't run `alexa-ai deploy`, the web simulator or the Local Inspector. | Built a web Alexa+ simulator (allowed by the track) and an MCP Apps host that renders the same UI; asked in Discord. |
| 3 | Protocol version | The overview says Alexa+ supports MCP **2025-11-25**, but the client lifecycle page shows Alexa+ sending `protocolVersion: "2025-03-26"` in `initialize`. | Unclear which features (e.g. resumability, MCP Apps) are negotiated. | Server supports 2025-11-25, 2025-06-18 and 2025-03-26; tests cover all three. |
| 4 | Tool result `_meta.ui` | The MCP Apps spec puts `_meta.ui.resourceUri` on the **tool definition**; the Alexa+ lifecycle example shows it (with `invoking`/`invoked`) in the **tool result**. | Ambiguity about where Alexa+ looks. | Set it in both places. |
| 5 | MCP Apps bundle size | Using the official `App` class bundles the SDK + Zod: the view was **520 KB**, against Alexa+'s "keep payloads light" guidance. | Heavy webview on Echo Show. | Wrote a minimal view-side bridge (14 KB total) and verified it against the official `AppBridge` host in browser tests. |
| 6 | MCP Apps handshake timing | With `iframe.srcdoc`, the view sent `ui/initialize` before the host had attached its listener; cards stayed on "Loading…". | Blank cards. | Host connects before loading the view; the view retries `ui/initialize`. |
| 7 | Streamable HTTP on serverless | Examples are stateful (session ids, SSE); Vercel instances don't share memory. | Had to derive a stateless configuration from type definitions. | `sessionIdGenerator: undefined`, `enableJsonResponse: true`, one server per request, `405` for GET/DELETE. |
| 8 | SDK edge case | An empty JSON array (`[]`) body got `202 Accepted`. | A malformed request looked successful. | Validate the body before handing it to the SDK; reject batches. |
| 9 | Display-mode / layout docs | Visual foundations give a 768×480 base canvas and a 1.667 zoom for Echo Show 8/15, but the layout page lists `hostContext` fields (`deviceClass`, `isMobile`, `maxWidth`) that aren't in the MCP Apps spec types, with no example values. | Guessing device-class strings. | Treat `deviceClass` containing "echo"/"show" or `platform: desktop` as a screen; scale from `maxWidth`. |
| 10 | AWS Builder mini challenge | AWS credit requests closed on 7 Oct 2026 because codes ran out. | Entering it means paying for AWS. | Entered the Open Source mini challenge. |
