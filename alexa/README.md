# Publishing Barrio on Alexa+ (MCP Toolkit)

Barrio is built against Amazon's **Alexa+ MCP Toolkit** documentation. This folder has everything
needed to register it as an Alexa+ add-on.

## Two ways to ship it

| Add-on | MCP endpoint | When |
|---|---|---|
| **Barrio** (directory) — recommended | `https://<deployment>/api/mcp` | One certified add-on reaches every business on Barrio ("Alexa, ask Barrio for a haircut at La Familia"). Small businesses never have to go through a store listing and certification themselves. |
| One business | `https://<deployment>/api/mcp/<slug>` | A business that wants its own add-on name ("Alexa, ask Peluquería La Familia…"). |

## Requirements checklist (from the toolkit docs)

| Requirement | Barrio |
|---|---|
| Streamable HTTP, MCP 2025-11-25 | ✅ (also accepts 2025-06-18 / 2025-03-26 — Alexa+'s client sends 2025-03-26) |
| Remote HTTPS URL | ✅ Vercel |
| Round trips under 500 ms | ✅ ~5 ms server time; keep Vercel (`iad1`) and Supabase (`us-east-1`) in the same region |
| Every listed tool invocable, valid `inputSchema`, params validated before acting | ✅ Zod schemas, fuzz-tested |
| Responses match the declared schema | ✅ `outputSchema` + `structuredContent` on every tool, validated by the official client in tests |
| MCP error contract (`isError` / JSON-RPC errors), never crash on bad input | ✅ |
| Synonyms / alternate spellings in parameters | ✅ English aliases for Spanish service names; dates in EN/ES |
| Stable identifiers for multi-step flows | ✅ service/dish/business ids, booking references |
| No tool names / JSON / internal ids in customer-facing speech | ✅ server instructions say so |
| "Still working" interim messages | ✅ `_meta.ui.invoking` / `invoked` on every tool |
| MCP Apps UI for screen devices | ✅ `ui://barrio/card-<hash>.html`, `text/html;profile=mcp-app`, single self-contained file (14 KB), versioned by content hash, light/dark, 768×480 base canvas |
| Log every tool call | ✅ structured, PII-free, with latency |
| Auth: 401 without `WWW-Authenticate`; RFC 9728 + RFC 8414 metadata; `S256` listed | ✅ optional OAuth 2.1 `client_credentials` (`BARRIO_OAUTH_CLIENT_ID/SECRET`, `BARRIO_MCP_AUTH=required` for a private server) |
| Privacy policy + terms of use (HTTPS) | ✅ `/privacy`, `/terms` |
| Icons 72/64/88/126/180/241 (light + dark), carousel 600×900 with alt text, banner 1200×600, logos 120×120 and 80 px high (SVG + PNG) | ✅ `public/alexa/` (regenerate with `npm run build:assets`) |
| Confirmation emails with booking ID, date/time, price, manage/cancel link, support contact | ✅ optional, via Resend (`RESEND_API_KEY`, `BARRIO_EMAIL_FROM`) |

## Steps

Prerequisites per Amazon's "Set up your development environment": an Alexa developer account on an
Alexa+-supported marketplace (US), Node.js 24+, and the AWS/npm setup Amazon provides for the
`@alexa-ai` packages. **Ask in the hackathon Discord whether participants get toolkit access.**

```bash
npm install -g @alexa-ai/cli
alexa-ai configure                      # Login with Amazon

# Validate the server first (Amazon's local inspector → certification-verdict.json)
addon-local-inspector https://<deployment>/api/mcp

# Scaffold, fill in the listing, deploy to the development stage
alexa-ai new mcp --name "Barrio" --locale en-US --mcp-server-url "https://<deployment>/api/mcp"
node alexa/listing.mjs https://<deployment>        # → alexa/listing.barrio.json (checks Amazon's limits)
#   copy its values into addon-package/addon.json
alexa-ai deploy                         # redeploy after any tool change
```

Then test in the Alexa+ web simulator (and on an Echo Show if you have one) with the example phrases
in the listing.
