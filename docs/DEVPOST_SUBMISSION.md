# Devpost submission — draft

**Project name:** Barrio
**Tagline (≤ 60 chars):** One Alexa+ add-on for every shop in the neighbourhood.
**Track:** Alexa+ · **Mini challenge:** Open Source
**Entry type:** own MCP server (Streamable HTTP, spec 2025-11-25) + a simulated Alexa+ experience in a web app
**Repo:** https://github.com/Miguelvv7/barrio
**Demo:** https://barrio-blush.vercel.app · **Video:** https://youtu.be/<id> (public, < 3 min, English)

**Built with:** typescript, next.js, react, model-context-protocol, mcp-apps, streamable-http, supabase, postgresql, oauth, tailwindcss, vercel, vitest, playwright, web-speech-api, claude

**Gallery:** `docs/gallery/1-hero.png`, `docs/gallery/2-echo-show-cards.png`, `public/alexa/carousel-*.png`, `docs/gallery/3-owner-dashboard.png` and `docs/gallery/4-on-a-phone.png`.

---

## Inspiration

In my town, Écija (Spain), my barber takes bookings on his phone between haircuts, and my dad answers the phone at his Tex-Mex restaurant during the dinner rush. They'll never hire a developer — and they'll certainly never get an Alexa+ add-on through a store listing and certification. I wanted the smallest possible step between "a business with a phone number" and "a business Alexa+ can talk to".

## What it does

The owner fills in a short form — or **takes a photo of the paper menu** — and Barrio gives the business its own **MCP server**. Customers ask Alexa+ about prices and dishes, check free times and book or cancel by voice; on an **Echo Show** they see the business's own cards (free times they can tap, dish details with clear gluten/allergen notes, the booking confirmation). Bookings appear in the owner's dashboard **and in the calendar on their phone**.

And because no small business will certify its own add-on, Barrio also exposes a **directory endpoint**: one MCP server — one Alexa+ add-on — in front of every business on the platform. "Alexa, ask Barrio for a haircut at La Familia tomorrow."

It's seeded with the published services, menu and prices of two real businesses in Écija, used with their owners' permission — **Restaurante El Rancho**, my dad's restaurant, and **Peluquería La Familia**, the barber I go to (I built his website). It's a demo: bookings made here aren't sent to them.

## How I built it

- **Following the Alexa+ MCP Toolkit docs:** Streamable HTTP (2025-11-25, also the 2025-03-26 version Alexa+'s client sends), `outputSchema` + `structuredContent` on every tool, "still working" messages, tool annotations, ~5–10 ms server time with a read-through cache and region pinning, optional OAuth 2.1 with RFC 8414/9728 metadata, privacy/terms pages, and every store asset at Amazon's sizes — generated from code.
- **A real MCP client in the simulator:** the simulated Alexa+ (a Claude agent) connects to the business's public endpoint over Streamable HTTP — `initialize`, `tools/list`, `tools/call`, `resources/read` — exactly as the track's FAQ describes for the simulated path. Every reply shows its MCP calls.
- **MCP Apps for Echo Show:** a ~20 KB self-contained card (768×480 base canvas, Amazon's card tokens, light/dark, fitted to Echo Show 8 and 15) linked from every tool. When a question could mean two things, the card shows the options to tap. The simulator and a public "screens" page render it with the official MCP Apps host, so judges can see exactly what an Echo Show would show.
- **Designed for voice:** "tomorrow", "el próximo viernes", "5:30pm", "half past five"; English aliases for Spanish services ("beard trim" → *Arreglo de barba*); ambiguous requests ("ensalada", "tacos with guacamole") ask instead of guessing; references without look-alike characters; alternatives on both sides of a lunch break; a retried request never books twice.
- **No double bookings:** a Postgres function with a per-business advisory lock re-checks capacity (the peak number of tables in use), the per-phone limit and an hourly ceiling against booking floods.
- **Honest about allergens:** gluten-free only when the restaurant says so; undeclared allergens → "ask the staff". Menu photo import never extracts allergens.
- **Owner tools:** photo/text menu import with review, split-shift hours, calendar subscription, email alerts, customer confirmation emails with a self-cancel link, 12-month data retention.

## Challenges

- Finding the real Alexa+ requirements (they're in the toolkit docs, not the hackathon page) and rebuilding against them.
- Getting the MCP Apps view from 520 KB to ~20 KB without breaking compatibility with the official host.
- Things that only break against the real world: the current Sonnet model rejects a forced tool choice (the menu import had to move to structured outputs), Supabase returns at most 1,000 rows per request, and a US evening is already tomorrow in Spain.
- Stateless Streamable HTTP on serverless, and booking rules that survive real life: lunch breaks, closing time, DST, 100 people asking for the same slot.

## Accomplishments

- 270 automated tests + a real-Postgres concurrency test (21 checks) + 64 browser checks in CI, plus 11 Supabase integration tests: protocol compliance, 100-customer races, 3,000 fuzzed calls with hostile input (zero 5xx).
- Three review rounds — the last one split by area (protocol, security, database, AI integration, Echo Show design, Amazon's docs). Findings like "tacos with guacamole" getting the guacamole's gluten-free answer, or a visitor's test business named "La Familia" receiving the real shop's bookings; every one fixed with a regression test.
- Live deployment, measured from Spain: sequential MCP round trips p50 150 ms / p95 222 ms (Alexa+ asks for under 500 ms); 2,000 calls with 100 concurrent clients, 0 errors. Locally: p50 6 ms.

## What I learned

MCP turns "integrate with a voice assistant" into "describe your business well". Most of the work was making tool descriptions, errors and cards useful to a model talking to a person — and making sure it never makes things up.

## What's next

Text-message confirmations, staff-level availability (several barbers with their own schedules), Google Business Profile import, and onboarding more businesses in Écija.

---

## Testing instructions for judges

- Live at https://barrio-blush.vercel.app — Landing: `/` · Simulator: `/try/la-familia`, `/try/el-rancho` · Echo Show cards: `/try/el-rancho/screens` · Dashboard (read-only): `/dashboard/la-familia`
- MCP (no auth): `POST /api/mcp` (all businesses) · `POST /api/mcp/la-familia` · `POST /api/mcp/el-rancho`
- Create your own business at `/dashboard/new` — you can edit what you create.
- The simulator also works by typing if your browser has no microphone. Use any phone number when booking: each number can hold three upcoming bookings per business.
- Opening hours are the real ones: La Familia takes appointments Monday to Friday, El Rancho takes tables Thursday to Sunday. On other days the assistant says it's closed and offers the next open day.
- The demo stays online until judging ends (20 November 2026).
