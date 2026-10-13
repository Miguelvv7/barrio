/**
 * Builds the "on screen" gallery the way a host would: an MCP client talks to the business's MCP
 * server (in-process, so it works even when the HTTP endpoint requires OAuth), calls each tool and
 * reads the MCP App with resources/read. Nothing here writes to the agenda.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BookingService } from "./booking-service";
import { buildMcpServer } from "./mcp/server";
import type { Store } from "./store/types";
import type { Business } from "./types";

export interface Shot {
  title: string;
  note?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  structuredContent: Record<string, unknown>;
}

export async function liveScreens(business: Business, store: Store): Promise<{ html: string; shots: Shot[] }> {
  const server = buildMcpServer(business, new BookingService(store));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "barrio-screens", version: "1.0.0" });
  await Promise.all([server.connect(b), client.connect(a)]);
  try {
    const { tools } = await client.listTools();
    const uiUri = (tools[0]?._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri;
    if (!uiUri) throw new Error("This server has no MCP App");
    const read = await client.readResource({ uri: uiUri });
    const html = (read.contents[0] as { text?: string }).text ?? "";

    const call = async (title: string, toolName: string, args: Record<string, unknown>): Promise<Shot | null> => {
      const r = await client.callTool({ name: toolName, arguments: args });
      if (r.isError || !r.structuredContent) return null;
      return { title, toolName, arguments: args, structuredContent: r.structuredContent as Record<string, unknown> };
    };

    const info = await call("“When are you open?”", "get_business_info", {});
    const sc = (info?.structuredContent ?? {}) as { local_now?: { date?: string }; address?: string; phone?: string };
    const today = sc.local_now?.date ?? new Date().toISOString().slice(0, 10);
    let avail: Shot | null = null;
    for (let i = 1; i <= 14 && !avail; i++) {
      const date = new Date(Date.parse(`${today}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
      const args = business.kind === "salon" ? { date, service: "haircut and beard trim" } : { date, party_size: 4 };
      const shot = await call(business.kind === "salon" ? "“Anything free for a haircut and beard trim?”" : "“A table for four?”", "check_availability", args);
      if (shot?.structuredContent.available) avail = shot;
    }
    const list: (Shot | null)[] = [info];
    if (business.kind === "salon") {
      list.push(await call("“How much is a haircut?”", "get_services", {}), avail);
    } else {
      list.push(
        await call("“What burgers do you have?”", "get_menu", { query: "hamburguesa" }),
        await call("“Is the guacamole gluten-free?”", "check_dish", { dish: "guacamole" }),
        await call("“And the Kansas burger?”", "check_dish", { dish: "burguer kansas" }),
        avail,
      );
    }
    const a2 = avail?.structuredContent;
    if (a2) {
      list.push({
        title: "“Book it.” — confirmation",
        note: "Example confirmation, not a real booking.",
        toolName: "create_booking",
        arguments: {},
        structuredContent: {
          view: "booking",
          message: "Example",
          booking: {
            reference: "K7Q3",
            business: business.name,
            address: sc.address ?? "",
            phone: sc.phone ?? "",
            date: String(a2.date),
            weekday: String(a2.weekday),
            time: String((a2.start_times as string[] | undefined)?.[0] ?? "17:00"),
            duration_minutes: Number(a2.duration_minutes ?? 45),
            service: String(a2.service),
            party_size: Number(a2.party_size ?? 1),
            customer_name: "Lucía",
          },
        },
      });
    }
    return { html, shots: list.filter((s): s is Shot => Boolean(s)) };
  } finally {
    await client.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
