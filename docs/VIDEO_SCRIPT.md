# Demo video (2:54)

**Watch:** [youtu.be/HZodxXUT3yc](https://youtu.be/HZodxXUT3yc) · English, with subtitles.

A customer books a table at my dad's restaurant by talking to the assistant, and he sees it in his
agenda. Everything on screen is the live deployment at
[barrio-blush.vercel.app](https://barrio-blush.vercel.app); only the waits for the model are cut.

The narration below is the script; the recorded take can differ by a word here and there.

| Scene | On screen | Narration |
|---|---|---|
| 1 | Title card, then the landing page | "Hi, I'm Miguel, from Écija, in the south of Spain. My dad runs a Tex-Mex restaurant. On a Friday night he's cooking, not answering the phone. He will never build a voice app." |
| 2 | "Live on Barrio" on the landing page | "Barrio gives every small business its own MCP server in five minutes, and puts them all behind one directory, built to ship as a single Alexa+ add-on. These two are real: my dad's restaurant, and the barber I go to, whose website I built." |
| 3 | [`/try/el-rancho`](https://barrio-blush.vercel.app/try/el-rancho): "Is the guacamole gluten-free?" → a table for four on Friday at nine → name and phone → "Yes" → "You're booked" | "This simulates Alexa+ on an Echo Show. The assistant knows nothing about the restaurant: every answer comes from an MCP call, and you can see each one. Gluten-free only when the restaurant says so. Allergens it doesn't know, it never guesses. The card on screen is the restaurant's own MCP App. It reads the booking back, and only books after I say yes." |
| 4 | The owner's dashboard: the table in the agenda, tagged "via Alexa+" | "My dad sees it in his agenda, tagged via Alexa+, and in the calendar on his phone. No new app to learn." |
| 5 | [`/try/la-familia`](https://barrio-blush.vercel.app/try/la-familia): the price of a haircut and beard trim, and the free times on Friday after five | "Same platform, any business. My barber's services are written in Spanish. I ask in English, and it still finds the right one, with the real price and the free times." |
| 6 | [`/try/el-rancho/screens`](https://barrio-blush.vercel.app/try/el-rancho/screens) in English and Spanish, then the green CI checks | "Under the hood: Streamable HTTP, MCP 2025-11-25, structured output and an Echo Show card for every tool, in English or Spanish. A hundred people booking the same time never get more tables than the restaurant has. Every claim here is an automated test." |
| 7 | Closing card | "Barrio. Your neighbourhood, on Alexa+." |

Not in the video, for time: importing a menu from a photo ("Snap your menu" in the dashboard, shown
in [gallery image 5](gallery/5-snap-your-menu.png)).
