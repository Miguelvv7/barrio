# Devpost submission

**Project name:** Barrio
**Tagline:** One Alexa+ add-on for every shop in the neighbourhood.
**Track:** Alexa+ · **Mini challenge:** Open Source
**Entry type:** own MCP server (Streamable HTTP, spec 2025-11-25) + a simulated Alexa+ experience in a web app
**Repo:** https://github.com/Miguelvv7/barrio
**Demo:** https://barrio-blush.vercel.app · **Video:** https://youtu.be/HZodxXUT3yc (public, 2:54, English)

**Project history:** new — started and built during the submission window.

**Built with:** typescript, next.js, react, model-context-protocol, mcp-apps, streamable-http, supabase, postgresql, oauth, tailwindcss, vercel, vitest, playwright, web-speech-api, claude

**Gallery:** `docs/gallery/1-hero.png`, `docs/gallery/2-echo-show-cards.png`, `public/alexa/carousel-*.png`, `docs/gallery/3-owner-dashboard.png`, `docs/gallery/5-snap-your-menu.png` and `docs/gallery/4-on-a-phone.png`.

**Also in this submission:** product feedback → [`docs/PRODUCT_FEEDBACK.md`](PRODUCT_FEEDBACK.md) · friction log → [`docs/FRICTION_LOG.md`](FRICTION_LOG.md) · feature requests → [`docs/FEATURE_REQUESTS.md`](FEATURE_REQUESTS.md)

### Open Source mini challenge fields

- **Contribution URL:** https://github.com/Miguelvv7/echo-show-mcp-app-starter
- **Repo URL:** https://github.com/Miguelvv7/barrio
- **GitHub username:** Miguelvv7
- **What I did, how it works, why it matters:** I extracted the Echo Show card work from Barrio into a new, MIT-licensed starter kit for anyone building an Alexa+ add-on. It's a working MCP server (Streamable HTTP, stateless) with three example tools, each linked to one self-contained ~9 KB MCP App card (free times you can tap, item details, a booking confirmation, and a "which one?" card built from tool errors), plus a local preview that renders the cards with the official MCP Apps host on an Echo Show 8, an Echo Show 15 and a phone. Its README documents the details that took me days: authoring on the 768×480 canvas and fitting width and height, a separate phone layout, iOS text sizing, reporting height from `body`, taps as `ui/message`, and versioned card URIs. MCP Apps on Echo Show are new and barely documented; this gives the next developer a tested starting point instead of trial and error.

---

## Inspiration

In my town, Écija (Spain), my barber takes bookings on his phone between haircuts, and my dad answers the phone at his Tex-Mex restaurant during the dinner rush. They'll never hire a developer — and they'll certainly never get an Alexa+ add-on through a store listing and certification. I wanted the smallest possible step between "a business with a phone number" and "a business Alexa+ can talk to".

## What it does

The owner fills in a short form — or **takes a photo of the paper menu** — and Barrio gives the business its own **MCP server**. Customers ask Alexa+ about prices and dishes, check free times and book or cancel by voice; on an **Echo Show** they see the business's own cards (free times they can tap, dish details with clear gluten/allergen notes, the booking confirmation). Bookings appear in the owner's dashboard **and in the calendar on their phone**.

And because no small business will certify its own add-on, Barrio also exposes a **directory endpoint**: one MCP server — one Alexa+ add-on — in front of every business on the platform. "Alexa, ask Barrio for a haircut at La Familia tomorrow."

It's seeded with the published services, menu and prices of two real businesses in Écija, used with their owners' permission — **Restaurante El Rancho**, my dad's restaurant, and **Peluquería La Familia**, the barber I go to (I built his website). It's a demo: bookings made here aren't sent to them.

## How I built it

- **An MCP server for each business, plus one for all of them.** Built with the official MCP TypeScript SDK on Next.js and Supabase (Postgres), following Amazon's Alexa+ MCP Toolkit docs: Streamable HTTP (spec 2025-11-25), a structured answer from every tool, fast replies (~5–10 ms server time), optional OAuth, privacy and terms pages, and every store asset at Amazon's sizes.
- **Cards for Echo Show.** Every tool comes with a small card (MCP Apps) built to Amazon's design guide: free times you can tap, dish details with clear gluten and allergen notes, the booking confirmation. English or Spanish, light or dark, and a layout for phones.
- **Alexa+, simulated honestly.** The toolkit isn't open to entrants, so in the demo a Claude agent stands in for Alexa+. It connects to the business's public MCP endpoint like any client would, knows only what the server tells it, and every reply shows the MCP calls it made.
- **Designed for voice.** "Tomorrow", "el próximo viernes", "half past five"; English names for Spanish services ("beard trim"). When a request could mean two things, it asks. It reads the booking back and only books after a yes.
- **No double bookings.** The database checks capacity inside a lock, so 100 people asking for the same time never get more tables than the restaurant has.
- **It never guesses allergens.** Gluten-free only when the restaurant says so; otherwise, "ask the staff".
- **For the owner:** menu import from a photo, split-shift hours, an agenda where bookings are tagged "via Alexa+", a calendar subscription on their phone and email alerts.

## Challenges

- Finding the real Alexa+ requirements (they're in the toolkit docs, not the hackathon page) and rebuilding against them.
- Getting the MCP Apps view from 520 KB to ~26 KB without breaking compatibility with the official host.
- Things that only break against the real world: the current Sonnet model rejects a forced tool choice (the menu import had to move to structured outputs), Supabase returns at most 1,000 rows per request, and a US evening is already tomorrow in Spain.
- Stateless Streamable HTTP on serverless, and booking rules that survive real life: lunch breaks, closing time, DST, 100 people asking for the same slot.

## Accomplishments

- Two real businesses from my town in the demo, with their real services, menu and prices, used with their owners' permission.
- 335 automated tests + a real-Postgres concurrency test (21 checks) + 71 browser checks in CI, plus 11 Supabase integration tests: protocol compliance, 100-customer races, 3,000 fuzzed calls with hostile input (zero 5xx).
- Live deployment, measured from Spain: sequential MCP round trips p50 150 ms / p95 222 ms (Alexa+ asks for under 500 ms); 2,000 calls with 100 concurrent clients, 0 errors. Locally: p50 6 ms.
- An open-source starter kit for Echo Show cards, extracted from Barrio, so the next developer building an Alexa+ add-on doesn't start from zero.

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
