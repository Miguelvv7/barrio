/**
 * Load test against a running deployment, using the official MCP client over real HTTP.
 *   npx tsx scripts/load-test.ts http://localhost:3000 la-familia
 * Phase 0: 50 sequential calls from one client — the latency Alexa+ sees (budget: 500 ms per round trip).
 * Phase 1: 100 clients connect at once and race for the same slot (expect exactly `capacity` wins).
 *          The winning test bookings are cancelled again at the end. Skip with --no-race.
 * Phase 2: 2,000 read calls with 100 in flight; reports latency percentiles and errors.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const base = positional[0] ?? "http://localhost:3000";
const slug = positional[1] ?? "la-familia";
const race = !process.argv.includes("--no-race");
const url = new URL(`/api/mcp/${slug}`, base);

async function connect() {
  const client = new Client({ name: "barrio-load-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(url));
  return client;
}

function pct(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(0);
}

async function main() {
  {
    const solo = await connect();
    const lat: number[] = [];
    for (let i = 0; i < 50; i++) {
      const s = performance.now();
      await solo.callTool({ name: "get_business_info", arguments: {} });
      lat.push(performance.now() - s);
    }
    lat.sort((a, b) => a - b);
    const p95 = Number(pct(lat, 95));
    console.log(`Sequential round trips: p50 ${pct(lat, 50)} ms, p95 ${p95} ms (Alexa+ budget 500 ms) ${p95 < 500 ? "OK" : "OVER BUDGET"}`);
    await solo.close();
  }
  const t0 = performance.now();
  const clients = await Promise.all(Array.from({ length: 100 }, connect));
  console.log(`100 clients initialized in ${(performance.now() - t0).toFixed(0)} ms`);

  const info = JSON.parse(((await clients[0].callTool({ name: "get_business_info", arguments: {} })).content as { text: string }[])[0].text);
  const kind = info.type as "salon" | "restaurant";
  // Book the business's own first service rather than assuming a name.
  let service = "";
  if (kind === "salon") {
    const list = await clients[0].callTool({ name: "get_services", arguments: {} });
    service = JSON.parse((list.content as { text: string }[])[0].text).items[0].name;
  }
  const what = kind === "salon" ? { service } : { party_size: 2 };
  let date = "";
  let time = "";
  for (let d = 1; d <= 14 && !time; d++) {
    const candidate = new Date(Date.parse(`${info.local_now.date}T00:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
    const r = await clients[0].callTool({ name: "check_availability", arguments: { date: candidate, ...what } });
    const body = JSON.parse((r.content as { text: string }[])[0].text);
    if (body.available) {
      date = candidate;
      time = body.start_times[Math.floor(body.start_times.length / 2)];
    }
  }
  let wins = 0;
  if (race) {
    const phone = (i: number) => `69${String(1_000_000 + i).padStart(7, "0")}`;
    const results = await Promise.all(
      clients.map((c, i) =>
        c.callTool({ name: "create_booking", arguments: { date, time, ...what, customer_name: `Load ${i}`, customer_phone: phone(i) } }),
      ),
    );
    const won = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !r.isError)
      .map(({ r, i }) => ({ reference: (r.structuredContent as { booking: { reference: string } }).booking.reference, phone: phone(i) }));
    wins = won.length;
    console.log(`Race for ${date} ${time}: ${wins} booked, ${results.length - wins} refused with alternatives`);
    // Leave the real agenda as we found it.
    let cancelled = 0;
    for (const w of won) {
      const r = await clients[0].callTool({ name: "cancel_booking", arguments: { reference: w.reference, customer_phone: w.phone } });
      if (!r.isError) cancelled++;
    }
    console.log(`Cancelled ${cancelled} of ${wins} test bookings again${cancelled < wins ? " — cancel the rest from the dashboard" : ""}`);
  }

  const latencies: number[] = [];
  let errors = 0;
  let next = 0;
  const TOTAL = 2000;
  const tools = kind === "salon" ? ["get_services", "get_business_info", "check_availability"] : ["get_menu", "check_dish", "check_availability"];
  const t1 = performance.now();
  await Promise.all(
    clients.map(async (c) => {
      while (next < TOTAL) {
        const n = next++;
        const name = tools[n % tools.length];
        const args =
          name === "check_availability"
            ? { date, ...what }
            : name === "check_dish"
              ? { dish: "guacamole" }
              : {};
        const s = performance.now();
        try {
          await c.callTool({ name, arguments: args });
        } catch {
          errors++;
        }
        latencies.push(performance.now() - s);
      }
    }),
  );
  const secs = (performance.now() - t1) / 1000;
  latencies.sort((a, b) => a - b);
  console.log(
    `${TOTAL} calls, 100 concurrent: ${(TOTAL / secs).toFixed(0)} req/s, p50 ${pct(latencies, 50)} ms, p95 ${pct(latencies, 95)} ms, p99 ${pct(latencies, 99)} ms, errors ${errors}`,
  );
  await Promise.all(clients.map((c) => c.close()));
  if (errors > 0 || (race && wins < 1)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
