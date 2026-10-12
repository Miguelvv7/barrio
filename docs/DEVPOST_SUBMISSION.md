# Devpost submission — draft

**Project name:** Barrio
**Tagline (≤ 60 chars):** Your neighbourhood's small businesses, on Alexa+.
**Track:** Alexa+ · **Mini challenge:** Open Source
**Repo:** https://github.com/Miguelvv7/barrio
**Demo:** https://<your-vercel-url> · **Video:** https://youtu.be/<id> (public or unlisted, < 3 min, English)

**Built with:** typescript, next.js, react, model-context-protocol, mcp, streamable-http, supabase, postgresql, tailwindcss, vercel, vitest, playwright, web-speech-api, claude

---

## Inspiration

In my town, Écija (Spain), the barber takes bookings by WhatsApp between haircuts and the Tex-Mex restaurant answers the phone during the dinner rush. They'll never hire a developer to build a voice skill. But their customers are starting to ask assistants for everything. I wanted the smallest possible step between "a business with a phone number" and "a business Alexa+ can talk to".

## What it does

The owner fills in a short form — services or menu, prices, opening hours, how many chairs or tables — and Barrio gives them **one URL: their own MCP server**. Point Alexa+ at it and customers can ask about prices and dishes, check free times and book or cancel by voice. Bookings land in the owner's dashboard tagged "via Alexa+".

It's running for two real businesses with their real data: **Peluquería La Familia** (barber) and **Restaurante El Rancho** (Tex-Mex).

## How I built it

- **MCP server:** Streamable HTTP, spec 2025-11-25, built with the official TypeScript SDK. Stateless (one server per request) so it scales on Vercel; multi-tenant by URL; each business type gets the right tools (`get_services` vs `get_menu` + `check_dish`).
- **Designed for voice:** tools accept "tomorrow", "viernes", "5:30pm" and fuzzy service names; ambiguous requests make the tool ask instead of guessing; references are 4 characters with no look-alike letters; when a slot is gone the tool returns the nearest alternatives. Server instructions enforce the flow: check → read back → explicit yes → book.
- **No double bookings:** a Postgres function with a per-business advisory lock re-checks capacity atomically. Verified with 100 simultaneous bookings for one slot → exactly one succeeds.
- **Honest about allergens:** if the restaurant hasn't declared them, `check_dish` says so and sends the customer to the staff. It never invents safety information.
- **Alexa+ simulator:** a voice web app (speech in, speech out, English/Spanish) driven by an agent whose only tools are the ones it discovers over MCP — every answer is traceable to an MCP call, shown on screen.
- **Owner dashboard:** agenda, services/menu editor with gluten-free and allergen declarations, split-shift opening hours, capacity settings. Read-only for visitors so the demo can't be broken.

## Challenges

- Making Streamable HTTP work statelessly on serverless.
- Booking rules that hold up in real life: lunch breaks, appointments that would run past closing, minimum notice, the October daylight-saving change, local midnight vs UTC.
- Concurrency: the obvious "check then insert" double-books under load. Moving the check into a locked database function fixed it.

## Accomplishments

- 150 automated tests plus 51 browser end-to-end checks: MCP protocol compliance, 100-customer races, 3,000 fuzzed calls with hostile input (zero 5xx), real-Postgres and PostgREST integration.
- An independent review pass found 11 more issues (the worst: "ensalada" silently picking one of two salads and giving the wrong gluten-free answer). All fixed, each with a regression test.
- 2,000 MCP calls with 100 concurrent clients: 0 errors.

## What I learned

MCP turns "integrate with a voice assistant" into "describe your business well". Most of the work was making tool descriptions and errors useful to a model talking to a person.

## What's next

WhatsApp/SMS confirmations, Google Calendar sync, staff-level availability (several barbers with their own schedules), and onboarding more businesses in Écija.

---

## Product feedback / friction log

Paste from `docs/PRODUCT_FEEDBACK.md` and `docs/FRICTION_LOG.md` (after reviewing them).

## Testing instructions for judges

- Landing: `/` · Simulator: `/try/la-familia`, `/try/el-rancho` · Dashboard (read-only): `/dashboard/la-familia`
- MCP endpoints (no auth): `POST /api/mcp/la-familia`, `POST /api/mcp/el-rancho`
- Create your own business at `/dashboard/new` — you can edit the business you create.
