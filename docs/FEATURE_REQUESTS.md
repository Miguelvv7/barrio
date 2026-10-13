# Feature requests

What I'd want built after making Barrio, why it matters, and how urgent it is.

| # | Request | Why it matters | Urgency |
|---|---|---|---|
| 1 | **Toolkit access (or a public validator) for hackathon participants and developers outside the US** — at least the Local Inspector's checks as a standalone tool. | Today you can't know whether your MCP server would pass Alexa+'s checks until you're admitted to the Preview. A public validator would catch most problems before certification. | Critical |
| 2 | **Example `hostContext` values per device** (Echo Show 5/8/15, Fire TV, the Alexa app on a phone) and guidance on phone layouts. | Developers guess `deviceClass` strings and sizes; cards get cut off on 16:9 screens or become unreadable on phones. | Important |
| 3 | **Directory / multi-tenant add-ons**: a supported way for one add-on to serve many small businesses, with per-business names ("Alexa, ask Barrio for La Familia"). | Small businesses will never certify their own add-on. One certified platform add-on in front of many verified businesses is how they get onto Alexa+. | Important |
| 4 | **A dependency-free MCP Apps view runtime** in `@modelcontextprotocol/ext-apps`. | The official view class adds ~500 KB to a card that should weigh a few KB on an Echo Show. | Important |
| 5 | **One answer on protocol version and `_meta.ui` placement** in the toolkit docs. | Saves every developer the same hour of supporting three versions and duplicating metadata. | Important |
| 6 | **An official stateless Streamable HTTP example** for serverless platforms. | Most small add-ons will run on serverless functions, which can't keep sessions in memory. | Nice-to-have |
| 7 | **Business verification for add-on platforms**: a way to show customers that "La Familia" on Barrio is the real shop. | Without it, a platform has to vet businesses itself, or a copycat could take a real shop's bookings. | Nice-to-have |
