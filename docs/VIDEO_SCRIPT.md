# Demo video script (target 2:45, English)

> The story: a customer books a table at my dad's restaurant by talking to Alexa+, and he sees it in
> his dashboard. Record with **Cmd + Shift + 5** on the Mac (microphone on): the screen first, talking
> to the assistant, then the voice-over in iMovie. No music unless it's royalty-free. Upload to YouTube
> as **Public**. Add subtitles.
>
> Before recording: fresh deploy; clear the demo bookings so the agenda starts empty. Ask for
> **"on Friday"**: El Rancho is open Friday 19:00–23:30 and La Familia until 18:00, whatever day you
> record. Tabs ready: `/try/el-rancho` (EN, Voice on, mic allowed), `/dashboard/el-rancho` logged in,
> `/try/la-familia`, `/try/el-rancho/screens`, the repo's Actions page, and a photo of a paper menu on
> the desktop. Browser zoom 110–125% so text reads on YouTube.
>
> Keep other brands out of the frame: no messaging-app names, no phone home screens.
>
> Each phone number can hold three upcoming bookings per business: clear the bookings between takes,
> or use a different number.
>
> Introduce yourself in the first line — judges watch a lot of videos, and it costs two seconds.
>
> Pause, don't rush; cut the waiting for the model in the edit.

| Time | On screen | Voice-over (read this) |
|---|---|---|
| 0:00–0:12 | Title card with your name, then the landing page, slow scroll | "Hi, I'm Miguel, from Écija, in the south of Spain. My dad runs a Tex-Mex restaurant. On a Friday night he's cooking, not answering the phone. He will never build a voice app." |
| 0:12–0:24 | "Live on Barrio" section, with the name overlay for ~4 s | "Barrio gives every small business its own MCP server in five minutes, and puts them all behind one directory, built to ship as a single Alexa+ add-on. These two are real: my dad's restaurant, and the barber I go to, whose website I built." |
| 0:24–1:20 | `/try/el-rancho`. Say: "Is the guacamole gluten-free?" → "Can I book a table for four on Friday at nine pm?" → (tap 21:00 if the card shows times) → "Miguel, 600 123 456." → "Yes, please." | "This simulates Alexa+ on an Echo Show. The assistant knows nothing about the restaurant: every answer comes from an MCP call, and you can see each one. Gluten-free only when the restaurant says so. Allergens it doesn't know, it never guesses. The card on screen is the restaurant's own MCP App. It reads the booking back, and only books after I say yes." |
| 1:20–1:30 | `/dashboard/el-rancho`: the table in the agenda, tagged "via Alexa+" | "My dad sees it in his agenda, tagged via Alexa+, and in the calendar on his phone. No new app to learn." |
| 1:30–1:50 | `/try/la-familia`: "How much is a haircut and beard trim?" → "Anything free on Friday after five?" (no booking) | "Same platform, any business. My barber's services are written in Spanish. I ask in English, and it still finds the right one, with the real price and the free times." |
| 1:50–2:12 | Dashboard → "Snap your menu" → upload the photo → review list → Add | "Onboarding is a photo. The owner snaps the paper menu, Claude reads it, and they tick what to publish. Allergens are never read from a photo: the owner declares them." |
| 2:12–2:35 | `/try/el-rancho/screens` (switch Host locale to ES and back), then the green CI checks | "Under the hood: Streamable HTTP, MCP 2025-11-25, structured output and an Echo Show card for every tool, in English or Spanish. A hundred people booking the same time never get more tables than the restaurant has. Every claim here is an automated test." |
| 2:35–2:45 | Closing card: name and links | "Barrio. Your neighbourhood, on Alexa+." |

Tips: if you stumble, pause and repeat the sentence — cut it later. If the live demo misbehaves while
recording, use the screens page (`/try/<slug>/screens`): every card there comes from the live MCP server
and needs no API key.
