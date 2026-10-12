/**
 * Load test against a running deployment, using the official MCP client over real HTTP.
 *   npx tsx scripts/load-test.ts http://localhost:3000 la-familia
 * Phase 1: 100 clients connect at once and race for the same slot (expect exactly `capacity` wins).
 * Phase 2: 2,000 read calls with 100 in flight; reports latency percentiles and errors.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = process.argv[2] ?? "http://localhost:3000";
const slug = process.argv[3] ?? "la-familia";
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
  const t0 = performance.now();
  const clients = await Promise.all(Array.from({ length: 100 }, connect));
  console.log(`100 clients initialized in ${(performance.now() - t0).toFixed(0)} ms`);

  const info = JSON.parse(((await clients[0].callTool({ name: "get_business_info", arguments: {} })).content as { text: string }[])[0].text);
  const kind = info.type as "salon" | "restaurant";
  let date = "";
  let time = "";
  for (let d = 1; d <= 14 && !time; d++) {
    const candidate = new Date(Date.parse(`${info.local_now.date}T00:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
    const r = await clients[0].callTool({
      name: "check_availability",
      arguments: kind === "salon" ? { date: candidate, service: "Arreglo de barba" } : { date: candidate, party_size: 2 },
    });
    const body = JSON.parse((r.content as { text: string }[])[0].text);
    if (body.available) {
      date = candidate;
      time = body.start_times[Math.floor(body.start_times.length / 2)];
    }
  }
  const race = await Promise.all(
    clients.map((c, i) =>
      c.callTool({
        name: "create_booking",
        arguments: {
          date,
          time,
          ...(kind === "salon" ? { service: "Arreglo de barba" } : { party_size: 2 }),
          customer_name: `Load ${i}`,
          customer_phone: `69${String(1_000_000 + i).padStart(7, "0")}`,
        },
      }),
    ),
  );
  const wins = race.filter((r) => !r.isError).length;
  console.log(`Race for ${date} ${time}: ${wins} booked, ${race.length - wins} refused with alternatives`);

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
            ? kind === "salon"
              ? { date, service: "Corte y Barba" }
              : { date, party_size: 2 }
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
  if (errors > 0 || wins < 1) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
