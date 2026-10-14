# Friction log — Barrio (Alexa+ track)

Real friction I hit while building Barrio, in the format the hackathon asks for. Severity: **High** blocked or broke a feature, **Medium** cost hours or led to a wrong first version, **Low** an annoyance.

---

### 1. Finding the Alexa+ requirements — High

- **Task:** build an MCP server that would pass as an Alexa+ add-on.
- **Steps:** followed the hackathon Resources page (MCP 2025-11-25 transport spec, MCP Apps extension) and started building.
- **Expected:** the Resources page links everything Alexa+ requires.
- **What happened:** Amazon's own **Alexa+ MCP Toolkit** docs (quickstart, design guide, functional requirements: latency, `structuredContent`, MCP Apps on Echo Show, bare 401s, store assets) weren't linked. I found them days later through a web search and rebuilt against them.
- **Workaround:** read the toolkit docs end to end; turned the requirements into a checklist (`alexa/README.md`) and into automated tests.
- **Suggestion:** link the toolkit docs (especially the functional requirements and the design guide) from the Alexa+ section of the Resources page.

### 2. Toolkit access for participants — High

- **Task:** test the server in Amazon's Local Inspector and web simulator, then `alexa-ai deploy`.
- **Steps:** followed the development-environment page.
- **Expected:** a way for hackathon participants to install the CLI.
- **What happened:** the page assumes an AWS account "given to your Alexa Solutions Architect", a private CodeArtifact registry for `@alexa-ai/*`, the US marketplace and Node 24. I'm in Spain and couldn't install it; the FAQ later confirmed participants don't get access.
- **Workaround:** the FAQ's simulated path: a web Alexa+ simulator whose MCP client calls my server over Streamable HTTP, plus an MCP Apps host that renders the same cards an Echo Show would.
- **Suggestion:** say up front on the Alexa+ track page that the toolkit isn't available and the simulated path is expected; or publish the Local Inspector's checks as a standalone, public validator.

### 3. Which protocol version Alexa+ speaks — Medium

- **Task:** negotiate the MCP version Alexa+ uses.
- **Steps:** read the toolkit overview and the client lifecycle page.
- **Expected:** one version.
- **What happened:** the overview says MCP **2025-11-25**; the lifecycle example shows Alexa+ sending `protocolVersion: "2025-03-26"` in `initialize`. It's unclear which features are negotiated.
- **Workaround:** the server accepts 2025-11-25, 2025-06-18 and 2025-03-26; tests cover all three.
- **Suggestion:** state the exact version(s) Alexa+'s client sends today and which features it uses.

### 4. Where Alexa+ reads `_meta.ui` — Medium

- **Task:** link the Echo Show card to each tool.
- **Steps:** followed the MCP Apps spec, then the Alexa+ lifecycle example.
- **Expected:** one place.
- **What happened:** the spec puts `_meta.ui.resourceUri` on the **tool definition**; the Alexa+ example shows it, with `invoking`/`invoked`, in the **tool result**.
- **Workaround:** set it in both.
- **Suggestion:** one sentence in the toolkit docs saying which one Alexa+ honours.

### 5. Device context for Echo Show cards — Medium

- **Task:** fit the card to Echo Show 8, Echo Show 15 and phones.
- **Steps:** read the visual foundations (768×480 base canvas, ×1.667 zoom) and the layout page.
- **Expected:** example `hostContext` values for each device.
- **What happened:** the layout page mentions fields (`deviceClass`, `isMobile`, `maxWidth`) that aren't in the MCP Apps spec types, with no example values. Two bugs followed: on a 16:9 Echo Show 15 the 16:10 canvas was cut off at the bottom, and on an iPhone the 768-wide canvas shrunk to the phone's width was unreadable (and iOS Safari enlarged small labels until they overlapped).
- **Workaround:** fit width *and* height and centre the canvas; a separate phone layout at natural size; `-webkit-text-size-adjust: 100%`. I published this as an open-source starter: [echo-show-mcp-app-starter](https://github.com/Miguelvv7/echo-show-mcp-app-starter).
- **Suggestion:** publish example `hostContext` objects for Echo Show 5/8/15 and the Alexa app, and say whether cards should have a phone layout.

### 6. MCP Apps view size — Medium

- **Task:** keep the card light, as the toolkit asks.
- **Steps:** used the official view-side `App` class.
- **Expected:** a small bundle.
- **What happened:** the view bundled the SDK and Zod: **520 KB** for one card.
- **Workaround:** a ~90-line view bridge over `postMessage`; the whole card is ~26 KB, verified against the official `AppBridge` host in browser tests.
- **Suggestion:** a dependency-free view runtime in `@modelcontextprotocol/ext-apps`, or a "light view" example.

### 7. MCP Apps handshake timing — Low

- **Task:** render the card in my own host for the simulator.
- **Steps:** set `iframe.srcdoc`, then connected `AppBridge`.
- **Expected:** the card loads.
- **What happened:** the view sent `ui/initialize` before the host listened; cards stayed on "Loading…".
- **Workaround:** connect the host first, then load the view; the view retries `ui/initialize`.
- **Suggestion:** document the order in the host example.

### 8. Stateless Streamable HTTP on serverless — Medium

- **Task:** run the MCP server on Vercel functions.
- **Steps:** started from the SDK examples.
- **Expected:** a serverless example.
- **What happened:** the examples are stateful (session ids, SSE), and serverless instances don't share memory. I derived the stateless setup from the type definitions; an empty `[]` body still got `202 Accepted`.
- **Workaround:** `sessionIdGenerator: undefined`, `enableJsonResponse: true`, one server per request, `405` for GET/DELETE, body validated before the SDK sees it.
- **Suggestion:** an official stateless example; reject empty batches.

### 9. Claude API: forced tool use rejected — High

- **Task:** read a photo of a paper menu into structured dishes.
- **Steps:** forced a tool call (`tool_choice: {type: "tool"}`) to get JSON back, tested against a fake client.
- **Expected:** it works with the current model.
- **What happened:** the current Sonnet model rejects a forced tool choice with a 400. My fake client never did, so "Snap your menu" would have failed on every real call.
- **Workaround:** structured outputs (`output_config.format` with a strict JSON schema); the test fake now returns real-shaped responses.
- **Suggestion:** flag model-specific breaking changes like this in the model migration notes, with the replacement pattern.

### 10. Claude API: thinking blocks and a changing system prompt — Medium

- **Task:** a multi-turn simulator where the model calls MCP tools.
- **Steps:** put the current local time in the system prompt.
- **Expected:** stable multi-round tool use.
- **What happened:** Haiku 5.5 thinks by default and its thinking blocks are sent back each tool round; if the minute changed between rounds the system prompt changed too, and the request failed. Thinking also counts toward `max_tokens`, which cut off spoken replies.
- **Workaround:** build the system prompt once per request, raise `max_tokens`, `effort: "low"` for voice, handle `max_tokens`/`refusal` stop reasons.
- **Suggestion:** a clearer error message when replayed thinking no longer matches the system prompt.

### 11. Supabase: silent 1,000-row cap — Medium

- **Task:** list a business's bookings for the agenda and the calendar feed.
- **Steps:** a plain `select()`.
- **Expected:** all rows, or a warning.
- **What happened:** PostgREST returns at most 1,000 rows, silently. A busy agenda would miss bookings.
- **Workaround:** page with `.range()`; an integration test with 1,200 bookings.
- **Suggestion:** a warning in the client when a response hits the cap.

### 12. Mini challenge rules — Low

- **Task:** enter the Open Source mini challenge.
- **Steps:** read a summary of the rules, then the Overview page.
- **Expected:** a public, MIT-licensed project repo would qualify.
- **What happened:** the Overview asks for a **new, additional** open-source project or a contribution *alongside* the main submission; that's easy to miss. AWS Builder credit requests had also closed on 7 October.
- **Workaround:** extracted the Echo Show card work into its own open-source starter.
- **Suggestion:** put the mini challenge requirements in a short checklist next to the submission form.
