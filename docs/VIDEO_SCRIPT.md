# Demo video script (target 2:45, English)

> Record with **Cmd + Shift + 5** on the Mac (microphone on), or record the screen first and the voice-over
> separately in iMovie. No music unless it's royalty-free. Upload to YouTube as **Public**. Add subtitles.
>
> Before recording: fresh deploy; record on a day when "tomorrow" is Monday–Thursday (the barber is closed
> at weekends). Tabs ready: `/try/la-familia` (Voice on, mic allowed), `/try/el-rancho`,
> `/dashboard/la-familia` logged in, `/dashboard/el-rancho` logged in, and a photo of a paper price list
> or menu on the desktop. Browser zoom 110–125% so text reads on YouTube.
>
> Keep other brands out of the frame: no messaging-app names, no phone home screens.
>
> Rehearsal bookings stay in the database and each phone number can hold three upcoming bookings:
> cancel them from the dashboard before the real take, or use a different number each time. Rehearse
> the taco question too — the "Which one?" card appears when the assistant checks the dish.
> (On La Familia's dashboard the import panel is called "Snap your price list".)
>
> The voice-over is ~230 words (about 1:40 spoken), which leaves time for the live answers. Pause, don't
> rush; cut the waiting for the model in the edit.

| Time | On screen | Voice-over (read this) |
|---|---|---|
| 0:00–0:12 | Landing page, slow scroll | "In my town, Écija, in the south of Spain, my barber takes bookings between haircuts, and my dad answers the phone at his restaurant in the middle of the dinner rush. They will never build a voice skill." |
| 0:12–0:22 | "Live on Barrio" section | "Barrio gives every small business its own MCP server in five minutes, and puts all of them behind one directory, built to ship as a single Alexa+ add-on. These are two real shops: my dad's Tex-Mex place, and the barber I go to, whose website I built." |
| 0:22–1:10 | `/try/la-familia`. Say: "How much is a haircut and beard trim?" → "Anything free tomorrow after five?" → **tap a time on the Echo Show card** → "Miguel, 600 123 456." → "Yes." | "This simulates Alexa+ on an Echo Show. The assistant knows nothing about the shop: every price and free time comes from an MCP call — you can see each one. The card is the business's own MCP App. I tap a time; it reads the booking back, and only books after I say yes." |
| 1:10–1:20 | Dashboard agenda: the booking tagged "via Alexa+" | "The barber sees it in his agenda, and in the calendar on his phone. No new app." |
| 1:20–1:50 | `/try/el-rancho`: "Which dishes are gluten-free?" → "Is the taco gluten-free?" (card: **Which one?** → tap *Taco Oregón*) | "For restaurants it's honest about allergens. Gluten-free means the restaurant says so. And when a question could mean two dishes, it doesn't guess: it asks which one, and I can tap the answer." |
| 1:50–2:15 | Dashboard → "Snap your menu" → upload the photo → review list → Add | "Onboarding is a photo. The owner snaps the paper menu, Claude reads it, and they tick what to publish. Allergens are never read from a photo — the owner declares them." |
| 2:15–2:35 | `/try/el-rancho/screens`, then the green CI checks on the pull request | "Under the hood: Streamable HTTP, MCP 2025-11-25, structured output and an Echo Show card for every tool, optional OAuth. A hundred people asking for the same slot get exactly one booking. Every claim here is an automated test." |
| 2:35–2:45 | Landing hero | "Barrio. Your neighbourhood, on Alexa+." |

Tips: if you stumble, pause and repeat the sentence — cut it later. If the live demo misbehaves while
recording, use the screens page (`/try/<slug>/screens`): every card there comes from the live MCP server
and needs no API key.
