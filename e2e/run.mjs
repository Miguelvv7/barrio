/**
 * Browser end-to-end tests (Playwright). Run against a production build started with an admin password:
 *
 *   npm run build
 *   BARRIO_ADMIN_PASSWORD=e2e-pass BARRIO_SECRET=e2e-secret npm start
 *   npx playwright install chromium        # once
 *   npm run test:e2e                       # BASE defaults to http://localhost:3000
 *
 * Uses the in-memory store (no Supabase vars), so it never touches real data.
 */
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2e-pass";
const launch = () =>
  chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-proxy-server"] });
const RUN = Date.now().toString(36).slice(-4).toUpperCase();
const LUCIA = `E2E Lucía ${RUN}`;
const BAR = `Bar Ñandú ${RUN}`;
const BAR_SLUG = `bar-nandu-${RUN.toLowerCase()}`;
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
// Log in as the owner/admin for the editing flows.
await page.goto(`${BASE}/login?next=/dashboard`);
await page.locator("input[name=password]").fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL((u) => u.pathname === "/dashboard");
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
// 404s come from the deliberate not-found checks; 405 is the spec-mandated answer to the MCP client's
// optional GET (this stateless server offers no SSE stream).
page.on("console", (m) => m.type() === "error" && !/\b40[45]\b/.test(m.text()) && errors.push(m.text()));

async function mcp(slug, body, headers = {}) {
  const r = await fetch(`${BASE}/api/mcp/${slug}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...headers }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const flash = async () => (await page.locator('[role=status], [role=alert]').first().textContent({ timeout: 5000 }).catch(() => "")) ?? "";

// 1. Landing, desktop + mobile
await page.goto(BASE);
check((await page.title()).includes("Barrio"), "landing title");
check((await page.locator("article").count()) >= 2, "landing lists both tenants");
for (const w of [375, 768]) {
  const p = await browser.newPage({ viewport: { width: w, height: 800 } });
  for (const path of ["/", "/dashboard", "/dashboard/la-familia", "/dashboard/el-rancho", "/try/el-rancho", "/dashboard/new"]) {
    await p.goto(BASE + path);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 0, `no horizontal scroll at ${w}px on ${path} (${over}px)`);
  }
  await p.close();
}

// 2. MCP booking shows up in the agenda as "via Alexa+"
const tomorrowRes = await mcp("la-familia", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_business_info", arguments: {} } });
const info = JSON.parse(tomorrowRes.json.result.content[0].text);
check(Boolean(info.local_now?.date), `get_business_info over HTTP (today ${info.local_now?.date})`);
// Ask for availability like a customer would, then book a free 45-minute slot (with a free slot
// right after it, used below for the manual booking).
const call = async (name, args) => {
  const r = await mcp("la-familia", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
  return { isError: Boolean(r.json.result?.isError), body: JSON.parse(r.json.result?.content?.[0]?.text ?? "{}") };
};
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
let booked = null;
let laterFree = null;
for (let d = 1; d <= 14 && !booked; d++) {
  const date = new Date(Date.parse(info.local_now.date + "T00:00:00Z") + d * 864e5).toISOString().slice(0, 10);
  const avail = await call("check_availability", { date, service: "Corte y Barba" });
  const times = avail.body.start_times ?? [];
  const set = new Set(times);
  const start = times.find((t) => set.has(fromMin(toMin(t) + 45)) && set.has(fromMin(toMin(t) + 90)));
  if (!start) continue;
  const r = await call("create_booking", { date, time: start, service: "Corte y Barba", customer_name: LUCIA, customer_phone: `600${RUN.charCodeAt(0)}${RUN.charCodeAt(1)}`.slice(0, 9) });
  if (!r.isError) {
    booked = r.body.booking;
    laterFree = fromMin(toMin(start) + 60);
  }
}
check(Boolean(booked), `create_booking over HTTP → ${booked?.reference}`);
await page.goto(`${BASE}/dashboard/la-familia`);
check(await page.getByText(LUCIA).isVisible(), "MCP booking visible in agenda");
check(await page.getByText("via Alexa+").first().isVisible(), "tagged 'via Alexa+'");

// 3. Edit a service price
const row = page.locator("details", { hasText: "Arreglo de barba" }).first();
await row.locator("summary").click();
await row.locator('input[name=price]').fill("8");
await row.getByRole("button", { name: "Save" }).click();
await page.waitForURL(/msg=/);
check((await flash()).includes("Saved"), "service saved flash");
const svc = await mcp("la-familia", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_services", arguments: { query: "barba" } } });
check(svc.json.result.content[0].text.includes("8,00"), "new price visible to MCP clients immediately");

// 4. Validation: bad hours
await page.goto(`${BASE}/dashboard/la-familia#hours`);
await page.locator('input[name=d1_open1]').fill("18:00");
await page.locator('input[name=d1_close1]').fill("09:00");
await page.getByRole("button", { name: "Save hours" }).click();
await page.waitForURL(/err=/);
check((await flash()).includes("Closing time must be after"), "hours validation error shown");

// 5. Manual booking + conflicting manual booking + cancel
await page.goto(`${BASE}/dashboard/la-familia#agenda`);
const form = page.locator("form", { hasText: "Add a phone or walk-in booking" });
await form.locator('input[name=date]').fill(booked.date);
await form.locator('input[name=time]').fill(fromMin(toMin(booked.time) + 15));
await form.locator('input[name=customer_name]').fill(`Walk In ${RUN}`);
await form.locator('input[name=customer_phone]').fill("611222333");
await form.getByRole("button", { name: "Add booking" }).click();
await page.waitForURL(/err=/);
const conflict = await flash();
check(/booked|Free nearby/i.test(conflict), `overlapping manual booking refused with alternatives: "${conflict.slice(0, 90)}"`);
const form2 = page.locator("form", { hasText: "Add a phone or walk-in booking" });
await form2.locator('input[name=date]').fill(booked.date);
await form2.locator('input[name=time]').fill(laterFree);
await form2.locator('input[name=customer_name]').fill(`Walk In ${RUN}`);
await form2.locator('input[name=customer_phone]').fill("611222333");
await form2.getByRole("button", { name: "Add booking" }).click();
await page.waitForURL(/msg=/);
check((await flash()).includes("Booked"), "manual booking created");
await page.locator("li", { hasText: LUCIA }).getByRole("button", { name: "Cancel" }).click();
await page.waitForURL(/msg=Booking/);
check((await flash()).includes("cancelled"), "owner cancelled the MCP booking");
check(!(await page.getByText(LUCIA).isVisible()), "cancelled booking left the agenda");

// 6. Onboard a brand-new restaurant and use its MCP server
await page.goto(`${BASE}/dashboard/new`);
await page.locator('input[value=restaurant]').check();
await page.locator('input[name=name]').fill(BAR);
await page.locator('textarea[name=description]').fill("Tapas.");
await page.getByRole("button", { name: /Create my MCP server/ }).click();
await page.waitForURL((u) => u.pathname === `/dashboard/${BAR_SLUG}`);
check(true, `new business created at /dashboard/${BAR_SLUG} (ñ → n)`);
const add = page.locator(".rotulo", { hasText: "Add a dish" });
await add.locator('input[name=category]').fill("Tapas");
await add.locator('input[name=name]').fill("Salmorejo");
await add.locator('input[name=price]').fill("4.5");
await add.locator('select[name=glutenFree]').selectOption("yes");
await add.getByRole("button", { name: "Add dish" }).click();
await page.waitForURL(/msg=Saved/);
const init = await mcp(BAR_SLUG, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
check(init.status === 200 && init.json.result.serverInfo.name === `barrio-${BAR_SLUG}`, "new tenant answers MCP initialize");
const dish = await mcp(BAR_SLUG, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "check_dish", arguments: { dish: "salmorejo" } } });
check(dish.json.result.content[0].text.includes("gluten-free by the restaurant"), "new dish + gluten-free flag served over MCP");
await page.goto(`${BASE}/dashboard/new`);
await page.locator('input[name=name]').fill(BAR);
await page.getByRole("button", { name: /Create my MCP server/ }).click();
await page.waitForURL(/err=/);
check((await flash()).includes("taken"), "duplicate web address refused");
await page.goto(`${BASE}/dashboard/new`);
await page.locator('input[name=name]').fill("New");
await page.getByRole("button", { name: /Create my MCP server/ }).click();
await page.waitForURL(/err=%22new%22|err=.*reserved/);
check((await flash()).includes("reserved"), "reserved slug refused");

// 6b. Echo Show cards: rendered by the official MCP Apps host (AppBridge) from the live MCP server
await page.goto(`${BASE}/try/el-rancho/screens`);
await page.waitForSelector('[data-testid="screen"]', { timeout: 20000 });
const views = await page.locator('[data-testid="screen"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-view")));
check(["business", "menu", "dish", "availability", "booking"].every((v) => views.includes(v)), `screens gallery shows every view (${views.join(", ")})`);
const dishFrame = page.locator('[data-view="dish"] iframe').first();
await dishFrame.scrollIntoViewIfNeeded();
const dishText = await page.frameLocator('[data-view="dish"] >> nth=0 >> iframe').locator(".card").innerText({ timeout: 10000 });
check(/Guacamole/.test(dishText) && /gluten-free/i.test(dishText), "MCP App rendered the dish card inside the sandboxed iframe");
const chip = page.frameLocator('[data-view="availability"] >> nth=0 >> iframe').locator("button.chip").first();
await chip.click();
await page.waitForSelector('[role="status"]', { timeout: 5000 });
check(/Book .* please/.test(await page.locator('[role="status"]').innerText()), "tapping a time sends ui/message back to the host");
const choice = page.frameLocator('[data-view="choice"] >> nth=0 >> iframe');
await page.locator('[data-view="choice"] iframe').first().scrollIntoViewIfNeeded();
const choiceText = await choice.locator(".card").innerText({ timeout: 10000 });
check(/Which one\?/.test(choiceText) && /Burguer/.test(choiceText), "an ambiguous question shows a \"which one?\" card with the options");
await choice.locator("button.opt").first().click();
await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some((e) => /Tell me about the/.test(e.textContent ?? "")), null, { timeout: 5000 });
check(true, "tapping an option asks about that dish");

// 6c. Directory endpoint (one add-on for every business)
const dir = await fetch(`${BASE}/api/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "find_businesses", arguments: { query: "barber" } } }),
});
const dirJson = await dir.json();
check(dirJson.result?.structuredContent?.businesses?.some((b) => b.id === "la-familia"), "directory find_businesses works over HTTP");

// 6d. Customer self-cancel page
const freeLater = (await call("check_availability", { date: booked.date, service: "Arreglo de barba" })).body.start_times ?? [];
const toCancel = await call("create_booking", { date: booked.date, time: freeLater.at(-1), service: "Arreglo de barba", customer_name: `Cancel ${RUN}`, customer_phone: "611999000" });
if (!toCancel.isError) {
  await page.goto(`${BASE}/cancel/la-familia?ref=${toCancel.body.booking.reference}`);
  await page.locator('input[name=phone]').fill("611 999 000");
  await page.getByRole("button", { name: /Cancel booking/ }).click();
  await page.waitForURL(/done=/);
  check(await page.getByText(/cancelled/i).first().isVisible(), "customer cancelled from the emailed link");
} else {
  check(false, `could not create booking to cancel: ${JSON.stringify(toCancel.body)}`);
}

// 6e. Owner calendar feed + legal pages
await page.goto(`${BASE}/dashboard/la-familia`);
const calLink = await page.locator('a[href^="webcal://"]').getAttribute("href");
const ics = await fetch(calLink.replace(/^webcal:\/\//, "http://"));
check(ics.ok && (ics.headers.get("content-type") ?? "").includes("text/calendar") && (await ics.text()).includes("BEGIN:VEVENT"), "owner calendar feed serves the agenda");
const forged = await fetch(`${BASE}/api/calendar/la-familia/not-the-token.ics`);
check(forged.status === 404, "calendar feed with a wrong token → 404");
for (const path of ["/privacy", "/terms"]) {
  const r = await page.goto(`${BASE}${path}`);
  check(r.status() === 200, `${path} is published`);
}

// 7. Simulator page without API key
await page.goto(`${BASE}/try/el-rancho`);
check(await page.getByText("ANTHROPIC_API_KEY").first().isVisible(), "simulator explains missing API key");

// 8. 404s
const nf = await page.goto(`${BASE}/dashboard/nope-nope`);
check(nf.status() === 404, "unknown dashboard → 404");
const nf2 = await page.goto(`${BASE}/try/nope-nope`);
check(nf2.status() === 404, "unknown /try → 404");

check(errors.length === 0, `no browser errors (${errors.slice(0, 3).join(" | ")})`);

// ---------- Permissions ----------
// Visitor
const visitor = await browser.newContext();
const v = await visitor.newPage();
await v.goto(`${BASE}/dashboard/la-familia`);
check(await v.getByText("Read-only demo view").isVisible(), "visitor sees read-only banner");
check((await v.getByRole("button", { name: "Add booking" }).count()) === 0, "visitor has no add-booking form");
check((await v.getByRole("button", { name: "Save hours" }).count()) === 0, "visitor has no save-hours button");
check((await v.locator("details summary", { hasText: "Edit" }).count()) === 0, "visitor sees no Edit affordances");
check((await v.getByText(`Walk In ${RUN}`).count()) === 0 && (await v.getByText(`W. I. ${RUN[0]}.`).count()) > 0, "visitor sees initials, not customer names");
check((await v.getByTitle("Booking reference").count()) === 0, "visitor can't see booking references");

// Forge: re-enable the disabled hours fieldset, inject a submit button, submit.
await v.evaluate(() => {
  const form = document.querySelector('input[name=d1_open1]').closest("form");
  form.querySelector("fieldset").disabled = false;
  form.querySelector("input[name=d1_open1]").value = "03:00";
  const b = document.createElement("button"); b.id = "forge"; b.textContent = "x"; form.appendChild(b);
});
await v.click("#forge");
await v.waitForURL(/err=/);
check(decodeURIComponent(v.url()).includes("Read-only"), "forged server action rejected on the server");
const hoursAfter = await v.locator("input[name=d1_open1]").inputValue();
check(hoursAfter === "09:00", `La Familia hours unchanged (${hoursAfter})`);

// Tampered owner cookie claiming La Familia
const famId = await (async () => { const r = await fetch(`${BASE}/dashboard/la-familia`); return r.ok; })();
await visitor.addCookies([{ name: "barrio_owner", value: "00000000-0000-0000-0000-000000000000.fakesig", url: BASE }]);
await v.goto(`${BASE}/dashboard/la-familia`);
check(famId && (await v.getByText("Read-only demo view").isVisible()), "tampered owner cookie gives no access");

// Visitor creates own business and can edit it, but still not La Familia
await v.goto(`${BASE}/dashboard/new`);
await v.locator("input[name=name]").fill("Barbería Visitante " + Date.now().toString(36));
await v.getByRole("button", { name: /Create my MCP server/ }).click();
await v.waitForURL(/barberia-visitante-/);
check(!(await v.getByText("Read-only demo view").isVisible()), "creator can edit their own business");
const addService = v.locator(".rotulo", { hasText: "Add a service" });
await addService.locator("input[name=name]").fill("Corte niño");
await addService.locator("input[name=price]").fill("9");
await addService.getByRole("button", { name: "Add", exact: true }).click();
await v.waitForURL(/msg=Saved/);
check(await v.getByText("Corte niño").first().isVisible(), "creator added a service");
check(await v.locator('input[name=notifyEmail]').isDisabled(), "sandbox owners can't switch on email alerts");
await v.goto(`${BASE}/dashboard/la-familia`);
check(await v.getByText("Read-only demo view").isVisible(), "…but La Familia stays read-only for them");

// Admin
const admin = await browser.newContext();
const a = await admin.newPage();
await a.goto(`${BASE}/login?next=/dashboard/la-familia`);
await a.locator("input[name=password]").fill("wrong");
await a.getByRole("button", { name: "Log in" }).click();
await a.waitForURL(/err=1/);
check(await a.getByText("Wrong password").isVisible(), "wrong password refused");
await a.locator("input[name=password]").fill(PASSWORD);
await a.getByRole("button", { name: "Log in" }).click();
await a.waitForURL((u) => u.pathname === "/dashboard/la-familia");
check(!(await a.getByText("Read-only demo view").isVisible()), "admin can edit La Familia");
const cookies = await admin.cookies();
const c = cookies.find((x) => x.name === "barrio_admin");
check(c?.httpOnly && c?.sameSite === "Lax", "admin cookie is httpOnly + SameSite=Lax");

// Open redirect protection
await a.goto(`${BASE}/login?next=//evil.com`);
await a.locator("input[name=password]").fill(PASSWORD);
await a.getByRole("button", { name: "Log in" }).click();
await a.waitForURL((u) => u.pathname === "/dashboard");
check(new URL(a.url()).host === new URL(BASE).host && new URL(a.url()).pathname === "/dashboard", `no open redirect (landed on ${a.url()})`);

// Logout
await a.goto(`${BASE}/dashboard`);
await a.getByRole("button", { name: "Log out" }).click();
await a.waitForURL(`${BASE}/`);
await a.goto(`${BASE}/dashboard/la-familia`);
check(await a.getByText("Read-only demo view").isVisible(), "logout removes admin rights");

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL E2E CHECKS PASSED");
process.exit(failures ? 1 : 0);
