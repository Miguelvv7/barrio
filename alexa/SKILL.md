---
name: barrio-local-bookings
description: Book a table or an appointment at a small local business on Barrio (barbers, restaurants) through its MCP server, and answer menu, price and allergen questions without inventing anything. Use when a customer wants to find a local business, check free times, book, cancel, or ask what a restaurant serves.
---

# Barrio: local bookings by voice

Barrio is an MCP server (Streamable HTTP) in front of small local businesses. This skill is for an
assistant connected to it: Alexa+ as an add-on, or any MCP client that loads Agent Skills.

## Which server

- **Directory** `https://barrio-blush.vercel.app/api/mcp`: every verified business. Start with
  `find_businesses`; every other tool takes `business` (the `id` it returns, or the name).
- **One business** `https://barrio-blush.vercel.app/api/mcp/<slug>`: the same tools without the
  `business` argument.

## Flow

1. **Find the business.** No business named → `find_businesses` with what the customer wants
   ("haircut", "tacos", "gluten free"). Several results → ask which one. `business_ambiguous` →
   read the `options` and ask.
2. **Answer questions from the tools only.** `get_business_info` (hours, address, phone, today's
   local date), `get_services` (salons), `get_menu` and `check_dish` (restaurants).
3. **Check availability.** `check_availability` with a date ("tomorrow", "viernes" or `YYYY-MM-DD`)
   and, for a salon, `service`; for a restaurant, `party_size`. If the customer gives a time of
   day ("after five", "before two"), pass `after` / `before` (24-hour, e.g. `17:00`) and offer only
   the times returned. If the day (or that window) is full, offer `other_times_that_day` or
   `next_available`.
4. **Read back before booking.** Business, date, time, service or party size, name and phone. Wait
   for an explicit yes.
5. **Book.** `create_booking`. Read the 4-character reference back slowly. A `slot_*` error comes
   with `alternatives`: offer them, don't retry the same time.
6. **Cancel.** `cancel_booking` needs the reference **and** the phone used to book. Confirm first.

## Rules

- **Allergens:** say only what `check_dish` returns. If allergens aren't published, say so and tell
  the customer to confirm with the staff. Never call a dish gluten-free unless the tool says
  "listed as gluten-free".
- Never invent prices, dishes, services or opening hours.
- Never read ids, error codes, JSON or tool names aloud.
- An error is an instruction for you, not for the customer: follow its `error` text (ask for the
  missing detail, offer the `options` or `alternatives`).
- A phone number can hold at most 3 upcoming bookings per business (`too_many_bookings`).

## On screens

Every tool links an MCP Apps card (`ui://barrio/card-….html`). On an Echo Show it shows the menu,
free times or the booking; options in an error are tappable choices.
