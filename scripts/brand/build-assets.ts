/**
 * Generates every image Barrio needs, from code (no design tool):
 *  - public/alexa/*  — Alexa+ add-on store assets at Amazon's required sizes (icons 72/64/88/126/180/241,
 *    square logo 120, horizontal logo 80 px high, carousel 600×900, banner 1200×600), light + dark;
 *  - src/app/icon.png, apple-icon.png, opengraph-image.png — web app icons;
 *  - docs/gallery/*  — Devpost gallery images.
 * Cards are the real MCP App, rendered by a tiny in-page MCP Apps host with data from the real
 * booking engine.
 *
 *   CHROMIUM_PATH=/path/to/chrome npx tsx scripts/brand/build-assets.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { BookingService, type Clock } from "../../src/lib/booking-service";
import { APP_HTML } from "../../src/lib/mcp/app-html.generated";
import { MemoryStore } from "../../src/lib/store/memory";
import { toMinutes, weekdayOf } from "../../src/lib/time";

const require = createRequire(import.meta.url);
const opentype = require("opentype.js");

const ROOT = new URL("../../", import.meta.url).pathname;
const C = { cal: "#f5efe3", paper: "#fffaf1", ink: "#1c1915", terracota: "#b9472a", azulejo: "#1e4a86", azulejoLight: "#7aa5e6", dark: "#14181e", darkInner: "#1b2028", cream: "#f1e9da" };

// ---------- Vector logo -----------------------------------------------------------------------
const fraunces = opentype.parse(
  readFileSync(require.resolve("@fontsource/fraunces/files/fraunces-latin-600-normal.woff")).buffer,
);

function wordmarkPath(text: string, size: number, x: number, baseline: number) {
  return fraunces.getPath(text, x, baseline, size).toPathData(2);
}
function wordmarkWidth(text: string, size: number) {
  return fraunces.getAdvanceWidth(text, size);
}

/** The azulejo tile mark, drawn in a `s`×`s` box. */
function tile(s: number, blue: string, bg: string, line = s * 0.045) {
  const r1 = s * 0.33;
  const r2 = r1 + line * 1.4;
  const arcs = [
    [0, 0],
    [s, 0],
    [0, s],
    [s, s],
  ]
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${(r1 + r2) / 2}" fill="none" stroke="${blue}" stroke-width="${line}"/>`)
    .join("");
  return `<rect width="${s}" height="${s}" fill="${bg}"/>
<line x1="0" y1="0" x2="${s}" y2="${s}" stroke="${blue}" stroke-opacity=".35" stroke-width="${line}"/>
<line x1="${s}" y1="0" x2="0" y2="${s}" stroke="${blue}" stroke-opacity=".35" stroke-width="${line}"/>
${arcs}<circle cx="${s / 2}" cy="${s / 2}" r="${s * 0.085}" fill="${blue}"/>`;
}

function squareLogoSvg(size: number, dark: boolean, withBackground = true) {
  const bg = dark ? C.dark : C.cal;
  const blue = dark ? C.azulejoLight : C.azulejo;
  const pad = size * 0.16;
  const inner = size - pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${withBackground ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"/>` : ""}
<g transform="translate(${pad} ${pad})"><clipPath id="c"><rect width="${inner}" height="${inner}" rx="${inner * 0.12}"/></clipPath>
<g clip-path="url(#c)">${tile(inner, blue, dark ? C.darkInner : C.paper)}</g>
<rect width="${inner}" height="${inner}" rx="${inner * 0.12}" fill="none" stroke="${dark ? C.cream : C.ink}" stroke-width="${inner * 0.035}"/></g>
</svg>`;
}

function horizontalLogoSvg(height: number, dark: boolean) {
  const ink = dark ? C.cream : C.ink;
  const blue = dark ? C.azulejoLight : C.azulejo;
  const mark = height * 0.72;
  const top = (height - mark) / 2;
  const size = height * 0.62;
  const x = mark + height * 0.26;
  const w = Math.ceil(x + wordmarkWidth("Barrio", size) + height * 0.08);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}">
<g transform="translate(0 ${top})"><clipPath id="c"><rect width="${mark}" height="${mark}" rx="${mark * 0.14}"/></clipPath>
<g clip-path="url(#c)">${tile(mark, blue, dark ? C.darkInner : C.paper)}</g>
<rect width="${mark}" height="${mark}" rx="${mark * 0.14}" fill="none" stroke="${ink}" stroke-width="${mark * 0.05}"/></g>
<path d="${wordmarkPath("Barrio", size, x, height * 0.72)}" fill="${ink}"/>
</svg>`;
}

// ---------- Real data for the cards -----------------------------------------------------------
async function cardData() {
  const store = new MemoryStore();
  const date = "2026-10-21";
  const clock: Clock = { now: () => ({ date: "2026-10-20", time: "09:00", weekday: weekdayOf("2026-10-20"), minutes: toMinutes("09:00") }) };
  const svc = new BookingService(store, clock);
  const salon = (await store.getBusinessBySlug("la-familia"))!;
  const rest = (await store.getBusinessBySlug("el-rancho"))!;
  const strip = <T extends { ok: boolean }>(r: T) => {
    const { ok, ...rest } = r as T & Record<string, unknown>;
    void ok;
    return rest;
  };
  const availability = strip(await svc.checkAvailability(salon, { date, service: "haircut and beard trim" }));
  const booking = strip(
    await svc.createBooking(salon, { date, time: "17:15", service: "haircut and beard trim", customer_name: "Lucía", customer_phone: "600111222" }),
  );
  const dish = strip(await svc.checkDish(rest, "guacamole"));
  const menu = await svc.getCatalog(rest, "hamburguesa");
  const info = await svc.getBusinessInfo(rest);
  return { availability, booking, dish, menu, info };
}

// ---------- Rendering -------------------------------------------------------------------------
const fontCss = `
@font-face{font-family:Fraunces;src:url("file://${require.resolve("@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2")}") format("woff2");font-weight:100 900}
@font-face{font-family:Instrument;src:url("file://${require.resolve("@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2")}") format("woff2");font-weight:400 700}
*{box-sizing:border-box;margin:0}body{font-family:Instrument,sans-serif}
.display{font-family:Fraunces,serif;font-variation-settings:"SOFT" 100,"WONK" 1}`;

/** A tiny MCP Apps host: answers ui/initialize, then sends the tool result into each card iframe. */
const hostScript = `
const frames=[...document.querySelectorAll("iframe[data-card]")];
window.addEventListener("message",(e)=>{const f=frames.find(x=>x.contentWindow===e.source);if(!f)return;const m=e.data;
if(m&&m.method==="ui/initialize"){const w=f.clientWidth,h=f.clientHeight;f.contentWindow.postMessage({jsonrpc:"2.0",id:m.id,result:{protocolVersion:"2026-01-26",hostInfo:{name:"brand",version:"1"},hostCapabilities:{},hostContext:{theme:f.dataset.theme,platform:"desktop",deviceClass:"echo-show-8",maxWidth:w,maxHeight:h,displayMode:"inline"}}},"*")}
if(m&&m.method==="ui/notifications/initialized"){f.contentWindow.postMessage({jsonrpc:"2.0",method:"ui/notifications/tool-result",params:{content:[],structuredContent:JSON.parse(f.dataset.card)}},"*")}
else if(m&&m.id!==undefined&&m.method){f.contentWindow.postMessage({jsonrpc:"2.0",id:m.id,result:{}},"*")}});
for(const f of frames){f.srcdoc=window.__APP}`;

function echo(card: unknown, width: number, theme: "dark" | "light" = "dark") {
  const h = Math.round(width / 1.6);
  const attr = JSON.stringify(card).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<div style="width:fit-content;background:#111;border-radius:${width * 0.04}px;padding:${width * 0.022}px;box-shadow:0 30px 60px -25px rgba(0,0,0,.55)">
<iframe data-card="${attr}" data-theme="${theme}" sandbox="allow-scripts" style="display:block;border:0;width:${width}px;height:${h}px;border-radius:${width * 0.012}px;background:${theme === "dark" ? "#0e1116" : "#faf9fb"}"></iframe></div>`;
}

function azulejoBand(h: number) {
  const s = h;
  return `<div style="height:${h}px;background-image:url('data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">${tile(s, C.azulejo, C.paper, s * 0.05)}</svg>`)}');background-size:${s}px ${s}px;border-top:2px solid ${C.ink};border-bottom:2px solid ${C.ink}"></div>`;
}

async function main() {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ executablePath, args: ["--no-proxy-server", "--allow-file-access-from-files"] });
  const page = await browser.newPage();
  const tmp = `${ROOT}.brand-tmp.html`;

  async function shoot(html: string, out: string, w: number, h: number, transparent = false) {
    writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? "transparent" : C.cal}}</style></head><body>${html}<script>window.__APP=${JSON.stringify(APP_HTML).replace(/<\//g, "<\\/")};${hostScript}</script></body></html>`);
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`file://${tmp}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    mkdirSync(out.slice(0, out.lastIndexOf("/")), { recursive: true });
    await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  }

  const alexa = `${ROOT}public/alexa`;
  // Vector logos
  for (const dark of [false, true]) {
    const v = dark ? "dark" : "light";
    writeFileSync(`${alexa}/logo-square-${v}.svg`, squareLogoSvg(120, dark));
    writeFileSync(`${alexa}/logo-square-${v}-transparent.svg`, squareLogoSvg(120, dark, false));
    writeFileSync(`${alexa}/logo-horizontal-${v}.svg`, horizontalLogoSvg(80, dark));
  }
  // PNGs from the SVGs
  for (const dark of [false, true]) {
    const v = dark ? "dark" : "light";
    await shoot(squareLogoSvg(120, dark), `${alexa}/logo-square-${v}.png`, 120, 120, true);
    await shoot(squareLogoSvg(120, dark, false), `${alexa}/logo-square-${v}-transparent.png`, 120, 120, true);
    const hz = horizontalLogoSvg(80, dark);
    const hw = Number(/width="(\d+)"/.exec(hz)![1]);
    await shoot(hz, `${alexa}/logo-horizontal-${v}.png`, hw, 80, true);
    for (const size of [72, 64, 88, 126, 180, 241]) {
      await shoot(squareLogoSvg(size, dark), `${alexa}/icon-${v}-${size}.png`, size, size, true);
    }
  }

  const d = await cardData();
  const phrase = (t: string) => `<p class="display" style="font-size:30px;line-height:1.2;color:${C.ink}">“${t}”</p>`;
  const kicker = (t: string) => `<p style="font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#56663a">${t}</p>`;
  const carousel = (k: string, title: string, say: string, card: unknown) => `
<div style="width:600px;height:900px;background:${C.cal};display:flex;flex-direction:column">
<div style="padding:44px 40px 0">${kicker(k)}<h1 class="display" style="font-size:52px;line-height:1;margin-top:12px;font-weight:500;color:${C.ink}">${title}</h1>
<div style="margin-top:22px">${phrase(say)}</div></div>
<div style="margin:auto 0;padding:0 28px">${echo(card, 520)}</div>${azulejoBand(28)}</div>`;

  const shots: [string, string, string, unknown, string][] = [
    ["Barber · appointments", "Book the barber by voice.", "Anything free tomorrow for a haircut and beard trim?", d.availability, "carousel-1-availability"],
    ["Restaurant · menu", "Ask before you order.", "Is the guacamole gluten-free?", d.dish, "carousel-2-dish"],
    ["Done in seconds", "Booked. Reference read back.", "Yes, book 5:15 for Lucía.", d.booking, "carousel-3-booking"],
  ];
  for (const [k, t, s, card, name] of shots) await shoot(carousel(k, t, s, card), `${alexa}/${name}.png`, 600, 900);

  const logoInline = horizontalLogoSvg(64, false);
  const banner = `<div style="width:1200px;height:600px;background:${C.cal};display:grid;grid-template-columns:1fr 560px;align-items:center;gap:30px;padding:0 56px">
<div>${logoInline}<h1 class="display" style="font-size:64px;line-height:.98;font-weight:500;margin-top:26px;color:${C.ink}">Your neighbourhood,<br><em style="color:${C.terracota}">on Alexa+.</em></h1>
<p style="font-size:21px;line-height:1.45;color:#5e5448;margin-top:20px">Book the barber, ask what’s gluten-free, reserve a table — at the small businesses around you.</p></div>
<div>${echo(d.booking, 520)}</div></div>`;
  await shoot(banner, `${alexa}/banner-1200x600.png`, 1200, 600);

  // Web app icons + social card
  await shoot(squareLogoSvg(512, false), `${ROOT}src/app/icon.png`, 512, 512, true);
  await shoot(squareLogoSvg(180, false), `${ROOT}src/app/apple-icon.png`, 180, 180, true);
  const og = banner.replace("width:1200px;height:600px", "width:1200px;height:630px");
  await shoot(og, `${ROOT}src/app/opengraph-image.png`, 1200, 630);

  // Devpost gallery (3:2)
  await shoot(banner.replace("width:1200px;height:600px", "width:1200px;height:800px"), `${ROOT}docs/gallery/1-hero.png`, 1200, 800);
  const grid = `<div style="width:1500px;height:1000px;background:${C.cal};padding:46px 56px">
${kicker("MCP Apps · what Alexa+ shows on an Echo Show")}
<h1 class="display" style="font-size:46px;font-weight:500;margin:10px 0 30px;color:${C.ink}">The business’s own cards, served by its MCP server.</h1>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:34px 40px">
${[d.availability, d.dish, d.menu, d.booking].map((c, i) => echo(c, 600, i % 3 === 0 ? "dark" : "light")).join("")}
</div></div>`;
  await shoot(grid, `${ROOT}docs/gallery/2-echo-show-cards.png`, 1500, 1000);

  await browser.close();
  console.log("Brand assets written to public/alexa, src/app and docs/gallery.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
