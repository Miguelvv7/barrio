# Devpost submission — draft

**Project name:** Barrio
**Tagline (≤ 60 chars):** One Alexa+ add-on for every shop in the neighbourhood.
**Track:** Alexa+ · **Mini challenge:** Open Source
**Repo:** https://github.com/Miguelvv7/barrio
**Demo:** https://<your-vercel-url> · **Video:** https://youtu.be/<id> (public or unlisted, < 3 min, English)

**Built with:** typescript, next.js, react, model-context-protocol, mcp-apps, streamable-http, supabase, postgresql, oauth, tailwindcss, vercel, vitest, playwright, web-speech-api, claude

**Gallery:** `docs/gallery/1-hero.png`, `docs/gallery/2-echo-show-cards.png`, `public/alexa/carousel-*.png`, plus a dashboard screenshot.

---

## Inspiration

In my town, Écija (Spain), the barber takes bookings on WhatsApp between haircuts and the Tex-Mex restaurant answers the phone during the dinner rush. They'll never hire a developer — and they'll certainly never get an Alexa+ add-on through a store listing and certification. I wanted the smallest possible step between "a business with a phone number" and "a business Alexa+ can talk to".

## What it does

The owner fills in a short form — or **takes a photo of the paper menu** — and Barrio gives the business its own **MCP server**. Customers ask Alexa+ about prices and dishes, check free times and book or cancel by voice; on an **Echo Show** they see the business's own cards (free times they can tap, dish details with clear gluten/allergen notes, the booking confirmation). Bookings appear in the owner's dashboard **and in the calendar on their phone**.

And because no small business will certify its own add-on, Barrio also exposes a **directory endpoint**: one MCP server — one Alexa+ add-on — in front of every business on the platform. "Alexa, ask Barrio for a haircut at La Familia tomorrow."

Running today for two real businesses with their real data: **Peluquería La Familia** and **Restaurante El Rancho**.

## How I built it

- **Built against the Alexa+ MCP Toolkit docs:** Streamable HTTP (2025-11-25, also the 2025-03-26 version Alexa+'s client sends), `outputSchema` + `structuredContent` on every tool, "still working" messages, tool annotations, ~5 ms server time with a read-through cache and region pinning for the 500 ms budget, optional OAuth 2.1 with RFC 8414/9728 metadata, privacy/terms pages, and every store asset at Amazon's sizes — generated from code.
- **MCP Apps for Echo Show:** a 14 KB self-contained card (768×480 base canvas, Amazon's card tokens, light/dark) linked from every tool. The simulator and a public "screens" page render it with the official MCP Apps host, so judges can see exactly what an Echo Show would show.
- **Designed for voice:** "tomorrow", "el próximo viernes", "5:30pm"; English aliases for Spanish services ("beard trim" → *Arreglo de barba*); ambiguous requests ("ensalada") ask instead of guessing; references without look-alike characters; alternatives when a slot is gone.
- **No double bookings:** a Postgres function with a per-business advisory lock re-checks capacity, the per-phone limit and an hourly ceiling against booking floods.
- **Honest about allergens:** gluten-free only when the restaurant says so; undeclared allergens → "ask the staff". Menu photo import never extracts allergens.
- **Owner tools:** photo/text menu import with review, split-shift hours, calendar subscription, email alerts, customer confirmation emails with a self-cancel link, 12-month data retention.

## Challenges

- Finding the real Alexa+ requirements (they're in the toolkit docs, not the hackathon page) and rebuilding against them.
- Getting the MCP Apps view from 520 KB to 14 KB without breaking compatibility with the official host.
- Stateless Streamable HTTP on serverless, and booking rules that survive real life: lunch breaks, closing time, DST, 100 people asking for the same slot.

## Accomplishments

- 184 automated tests + 60 browser checks in CI, including real Postgres: protocol compliance, 100-customer races, 3,000 fuzzed calls with hostile input (zero 5xx).
- Two independent review passes; every finding fixed with a regression test.
- Sequential MCP round trips p50 5 ms; 2,000 calls with 100 concurrent clients, 0 errors.

## What I learned

MCP turns "integrate with a voice assistant" into "describe your business well". Most of the work was making tool descriptions, errors and cards useful to a model talking to a person — and making sure it never makes things up.

## What's next

WhatsApp confirmations, staff-level availability (several barbers with their own schedules), Google Business Profile import, and onboarding more businesses in Écija.

---

## Testing instructions for judges

- Landing: `/` · Simulator: `/try/la-familia`, `/try/el-rancho` · Echo Show cards: `/try/el-rancho/screens` · Dashboard (read-only): `/dashboard/la-familia`
- MCP (no auth): `POST /api/mcp` (all businesses) · `POST /api/mcp/la-familia` · `POST /api/mcp/el-rancho`
- Create your own business at `/dashboard/new` — you can edit what you create.
