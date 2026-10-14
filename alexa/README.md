# Publishing Barrio on Alexa+ (MCP Toolkit)

Barrio follows Amazon's **Alexa+ MCP Toolkit** documentation. This folder has everything needed to
register it as an Alexa+ add-on once you have access to the toolkit. For the hackathon, Alexa+ is
simulated in the web app (`/try/<slug>`); the MCP server below is the same one an add-on would use.

An [Agent Skill](SKILL.md) (`SKILL.md`, name `barrio-local-bookings`) describes the booking flow
and the allergen rules for any assistant that loads skills; the same rules are in the server's MCP
`instructions`.

## Two ways to ship it

| Add-on | MCP endpoint | When |
|---|---|---|
| **Barrio** (directory) — recommended | `https://barrio-blush.vercel.app/api/mcp` | One certified add-on reaches every verified business on Barrio ("Alexa, ask Barrio for a haircut at La Familia"). Small businesses never have to go through a store listing and certification themselves. |
| One business | `https://barrio-blush.vercel.app/api/mcp/<slug>` | A business that wants its own add-on name ("Alexa, ask Peluquería La Familia…"). |

## Requirements checklist (from the toolkit docs)

| Requirement | Barrio |
|---|---|
| Streamable HTTP, MCP 2025-11-25 | ✅ (also accepts 2025-06-18 / 2025-03-26 — Alexa+'s client sends 2025-03-26) |
| Remote HTTPS URL | ✅ Vercel |
| Fast responses (the docs suggest results within a few seconds; 500 ms is the budget for Category SDK add-ons and the first carousel item) | ✅ ~5–10 ms server time per call measured locally; functions pinned to `iad1` (`vercel.json`) next to Supabase `us-east-1` |
| Every listed tool invocable, valid `inputSchema`, params validated before acting | ✅ Zod schemas, fuzz-tested |
| Responses match the declared schema | ✅ `outputSchema` + `structuredContent` on every tool, validated by the official client in tests |
| MCP error contract (`isError` / JSON-RPC errors), never crash on bad input | ✅ fuzz-tested; unexpected failures return a generic message, never raw internals |
| Synonyms / alternate spellings in parameters | ✅ English aliases for Spanish service names, English words for Spanish dishes; dates and spoken times in EN/ES ("quarter to one", "a las nueve y media de la noche") |
| Stable identifiers for multi-step flows | ✅ service/dish/business ids, booking references |
| No tool names / JSON / internal ids in customer-facing speech | ✅ server instructions say so |
| "Still working" interim messages | ✅ `_meta.ui.invoking` / `invoked` on every tool |
| MCP Apps UI for screen devices | ✅ `ui://barrio/card-<hash>.html`, `text/html;profile=mcp-app`, single self-contained file (~20 KB), versioned by content hash, light/dark, 768×480 base canvas fitted to the frame; errors with options render as tappable choices |
| Log every tool call | ✅ structured, PII-free, with latency |
| Auth: 401 without `WWW-Authenticate`; RFC 9728 + RFC 8414 metadata; `S256` listed | ✅ optional OAuth 2.1 `client_credentials` (`BARRIO_OAUTH_CLIENT_ID/SECRET`, `BARRIO_MCP_AUTH=required` for a private server — stays closed if the client is missing). Metadata passes the official MCP SDK's schemas |
| Privacy policy + terms of use (HTTPS) | ✅ `/privacy`, `/terms` |
| Icons 72/64/88/126/180/241 (light + dark), carousel 600×900 with alt text, banner 1200×600, logos 120×120 and 80 px high (SVG + PNG) | ✅ `public/alexa/` (regenerate with `npm run build:assets`); no prices in listing images |
| Listing: name ≤ 30, tagline 6–8 words, short description 2–3 sentences ≤ 123, long ≤ 4000, 3–4 example phrases ≤ 200 | ✅ checked by `node alexa/listing.mjs` |
| Confirmation emails with booking ID, date/time, price, manage/cancel link, support contact | ✅ optional, via Resend (`RESEND_API_KEY`, `BARRIO_EMAIL_FROM`) |

## Steps

Prerequisites per Amazon's "Set up your development environment": an Alexa developer account on an
Alexa+-supported marketplace (US), Node.js 24+, and the AWS/npm setup Amazon provides for the
`@alexa-ai` packages.

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

## Before submitting to certification

Amazon's add-on policies are stricter than the hackathon. Points to settle first:

- **Personal data by voice.** Barrio asks for the customer's phone number (to identify the booking).
  For certification, contact details should come from Alexa+ permissions or account linking rather
  than being spoken and read back.
- **Written confirmation.** Bookings should be confirmed in writing (email, SMS or a card) as well as by
  voice; today email is optional and needs an address.
- **Cancellation.** Read the booking and the cancellation policy back before cancelling.
- **Real businesses.** Written permission from each business to use its name and data.
