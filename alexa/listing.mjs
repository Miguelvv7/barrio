/**
 * Builds the Alexa+ add-on store listing for Barrio and checks Amazon's field limits.
 *
 *   node alexa/listing.mjs https://your-deployment.vercel.app            # directory add-on ("Barrio")
 *   node alexa/listing.mjs https://your-deployment.vercel.app la-familia # one business's own add-on
 *
 * Writes alexa/listing.<name>.json — copy the values into addon-package/addon.json after
 * `alexa-ai new mcp` (see alexa/README.md).
 */
import { writeFileSync } from "node:fs";

const [base, slug] = process.argv.slice(2);
if (!base?.startsWith("https://")) {
  console.error("Usage: node alexa/listing.mjs https://<deployment> [business-slug]  (must be HTTPS)");
  process.exit(1);
}
const url = base.replace(/\/$/, "");

const directory = {
  name: "Barrio",
  shortDescription: "Book the barber, ask what's on the menu and reserve a table at small local businesses — by voice.",
  fullDescription: [
    "Barrio puts the small businesses around you on Alexa+: the barber round the corner, the Tex-Mex place on the high street.",
    "",
    "Ask what a haircut costs, check free times for tomorrow afternoon, find out whether a dish is gluten-free, or book a table for four on Friday at nine. Alexa reads the details back and only books after you say yes; you get a short reference code to cancel any time.",
    "",
    "On Echo Show you see the business's own cards: free times you can tap, dish details with clear gluten and allergen notes, and your booking confirmation.",
    "",
    "Allergens are never guessed: if a restaurant hasn't declared them, Alexa tells you to ask the staff.",
    "",
    "Businesses join Barrio by filling in a short form — or by taking a photo of their menu — and their bookings appear in their own phone calendar.",
  ].join("\n"),
  examplePhrases: [
    "Alexa, ask Barrio for a haircut and beard trim at La Familia tomorrow afternoon.",
    "Alexa, ask Barrio if the guacamole at El Rancho is gluten-free.",
    "Alexa, ask Barrio for a table for four at El Rancho on Friday at nine.",
    "Alexa, ask Barrio to cancel my booking.",
  ],
  endpoint: `${url}/api/mcp`,
};

const perBusiness = {
  "la-familia": {
    name: "Peluquería La Familia",
    shortDescription: "Book a haircut, beard trim or hair design at Peluquería La Familia in Écija — by voice.",
    examplePhrases: [
      "Alexa, ask Peluquería La Familia how much a haircut and beard trim is.",
      "Alexa, ask Peluquería La Familia what's free tomorrow after five.",
      "Alexa, ask Peluquería La Familia to book a beard trim on Friday at eleven.",
    ],
  },
  "el-rancho": {
    name: "Restaurante El Rancho",
    shortDescription: "Ask about the menu, check gluten-free dishes and book a table at El Rancho, Écija — by voice.",
    examplePhrases: [
      "Alexa, ask Restaurante El Rancho what burgers they have.",
      "Alexa, ask Restaurante El Rancho if the guacamole is gluten-free.",
      "Alexa, ask Restaurante El Rancho for a table for four on Friday at nine.",
    ],
  },
};

const pick = slug ? { ...directory, ...perBusiness[slug], endpoint: `${url}/api/mcp/${slug}` } : directory;
if (slug && !perBusiness[slug]) {
  console.error(`No listing copy for "${slug}" yet — add it to perBusiness in this file.`);
  process.exit(1);
}

const listing = {
  locale: "en-US",
  distributionCountries: ["US"],
  name: pick.name,
  shortDescription: pick.shortDescription,
  fullDescription: pick.fullDescription,
  examplePhrases: pick.examplePhrases,
  privacyPolicyUrl: `${url}/privacy`,
  termsOfUseUrl: `${url}/terms`,
  icons: {
    light: Object.fromEntries([72, 64, 88, 126, 180, 241].map((s) => [`${s}x${s}`, `${url}/alexa/icon-light-${s}.png`])),
    dark: Object.fromEntries([72, 64, 88, 126, 180, 241].map((s) => [`${s}x${s}`, `${url}/alexa/icon-dark-${s}.png`])),
  },
  logos: {
    squareLight: { svg: `${url}/alexa/logo-square-light.svg`, png: `${url}/alexa/logo-square-light.png`, pngTransparent: `${url}/alexa/logo-square-light-transparent.png` },
    squareDark: { svg: `${url}/alexa/logo-square-dark.svg`, png: `${url}/alexa/logo-square-dark.png`, pngTransparent: `${url}/alexa/logo-square-dark-transparent.png` },
    horizontalLight: { svg: `${url}/alexa/logo-horizontal-light.svg`, png: `${url}/alexa/logo-horizontal-light.png` },
    horizontalDark: { svg: `${url}/alexa/logo-horizontal-dark.svg`, png: `${url}/alexa/logo-horizontal-dark.png` },
  },
  carousel: [
    { uri: `${url}/alexa/carousel-1-availability.png`, altText: "An Echo Show showing free times for a haircut and beard trim at Peluquería La Familia, as tappable buttons." },
    { uri: `${url}/alexa/carousel-2-dish.png`, altText: "An Echo Show showing the guacamole at Restaurante El Rancho: listed as gluten-free, allergens not published — ask the staff." },
    { uri: `${url}/alexa/carousel-3-booking.png`, altText: "An Echo Show confirming a booking at Peluquería La Familia with a four-letter reference code." },
  ],
  banner: { uri: `${url}/alexa/banner-1200x600.png`, altText: "Barrio — your neighbourhood on Alexa+." },
  integration: { type: "MCP", endpoints: [{ name: "default", type: "HTTPS", uri: pick.endpoint }] },
};

// Amazon's documented limits.
const problems = [];
if (listing.name.length > 30) problems.push(`name is ${listing.name.length} chars (max 30)`);
if (listing.shortDescription.length > 123) problems.push(`shortDescription is ${listing.shortDescription.length} chars (max 123)`);
if (listing.fullDescription.length > 4000) problems.push(`fullDescription too long`);
if (listing.examplePhrases.length < 3 || listing.examplePhrases.length > 4) problems.push("need 3–4 example phrases");
for (const p of listing.examplePhrases) if (p.length > 200) problems.push(`phrase over 200 chars: ${p}`);
for (const c of [...listing.carousel, listing.banner]) if (c.altText.length > 250) problems.push(`alt text over 250 chars`);
if (problems.length) {
  console.error("Listing doesn't meet Amazon's limits:\n- " + problems.join("\n- "));
  process.exit(1);
}

const file = new URL(`./listing.${slug ?? "barrio"}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(listing, null, 2) + "\n");
console.log(`OK — ${file.pathname} (name ${listing.name.length}/30, short description ${listing.shortDescription.length}/123)`);
