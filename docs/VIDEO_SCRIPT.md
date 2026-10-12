# Demo video script (target 2:45, English)

> Record the screen with **Cmd + Shift + 5** on the Mac (microphone on), or record the screen first
> and the voice-over separately in iMovie. No copyrighted music. Upload to YouTube as **Unlisted**
> (not Private). Add subtitles.
>
> Before recording: make a fresh deploy, open `/try/la-familia` in Chrome, turn "Voice on", allow
> the microphone, and have `/dashboard/la-familia` open in a second tab logged in as owner.

| Time | On screen | Voice-over (read this) |
|---|---|---|
| 0:00–0:15 | Landing page, slow scroll | "In my town, Écija, in the south of Spain, the barber takes bookings on WhatsApp between haircuts. The restaurant answers the phone during the dinner rush. They will never hire a developer to build a voice skill." |
| 0:15–0:30 | Hero → "Live on Barrio" cards | "Barrio gives any small business its own MCP server in five minutes, so Alexa+ can answer customers and take bookings for them. These are two real businesses, with their real prices and menu." |
| 0:30–1:20 | `/try/la-familia`. Speak: "How much is a haircut and beard trim?" → "Do you have anything tomorrow after five?" → "Book it. My name is Miguel, my phone is 600 123 456." → "Yes." | "This is the Alexa+ experience, simulated in the browser. Watch the MCP calls underneath each answer: the assistant knows nothing about the business — every price and every free time comes from the MCP server. It reads the booking back, and only books after I say yes." |
| 1:20–1:35 | Switch tab → dashboard agenda, the new booking tagged "via Alexa+" | "On the owner's side, the booking is already in the agenda, marked as coming from Alexa+." |
| 1:35–2:05 | `/try/el-rancho` in Spanish (ES toggle): "¿El guacamole es sin gluten?" then "¿Y la hamburguesa Kansas?" | "It works in Spanish too. And it's honest: the guacamole is listed as gluten-free by the restaurant, but for the Kansas burger they haven't published allergens — so it tells you to ask the staff instead of guessing." |
| 2:05–2:30 | Dashboard: edit a price, show the MCP URL card + tools list; quick cut to the test output (`npm test`) | "The owner edits prices and opening hours, and the assistant sees the change instantly. Under the hood: Streamable HTTP, MCP spec 2025-11-25, stateless so it scales on Vercel, and a database lock so a hundred people asking for the same slot can never double-book. I tested exactly that." |
| 2:30–2:45 | Landing page / `/dashboard/new` | "Barrio. Your neighbourhood, on Alexa+." |

Tips: if you stumble, pause and repeat the sentence — cut it later. Keep the browser zoom at 110–125% so text is readable on YouTube.
