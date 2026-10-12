/**
 * Builds one MCP server per business ("tenant"). Tool names and descriptions are written for a
 * voice assistant: short, explicit about when to call them, and explicit about what must be
 * confirmed with the customer first.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { BookingService, Result } from "../booking-service";
import type { Business } from "../types";

export const SERVER_VERSION = "1.0.0";

type AvailabilityArgs = Parameters<BookingService["checkAvailability"]>[1];
type BookingArgs = Parameters<BookingService["createBooking"]>[1];

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fromResult(result: Result<Record<string, unknown>>): CallToolResult {
  if (result.ok) {
    const { ok: _ok, ...rest } = result;
    void _ok;
    return ok(rest);
  }
  const { ok: _ok, ...rest } = result;
  void _ok;
  return { isError: true, content: [{ type: "text", text: JSON.stringify(rest, null, 2) }] };
}

function log(business: Business, tool: string, outcome: string) {
  // Structured, PII-free log line — useful in Vercel logs during judging.
  console.log(JSON.stringify({ evt: "mcp_tool", tenant: business.slug, tool, outcome }));
}

function instructionsFor(business: Business): string {
  const what =
    business.kind === "restaurant"
      ? "You can answer menu questions (get_menu, check_dish) and reserve tables."
      : "You can list services and prices (get_services) and book appointments.";
  return [
    `You are the voice assistant for ${business.name}. ${business.description}`,
    what,
    "Call get_business_info first if you need today's date, opening hours, address or phone.",
    "Booking flow: check_availability → read back the date, time, " +
      (business.kind === "restaurant" ? "party size" : "service") +
      ", name and phone to the customer → only after they say yes, call create_booking → read back the reference code.",
    "Never invent prices, dishes, allergens or opening hours: only use what the tools return.",
  ].join("\n");
}

const DATE_DESC =
  "Date of the visit. Prefer YYYY-MM-DD. Also accepts 'today', 'tomorrow', or a weekday name (next occurrence). " +
  "Times and dates are in the business's local time zone.";

export function buildMcpServer(business: Business, service: BookingService): McpServer {
  const server = new McpServer(
    { name: `barrio-${business.slug}`, title: `${business.name} (Barrio)`, version: SERVER_VERSION },
    { instructions: instructionsFor(business) },
  );

  server.registerTool(
    "get_business_info",
    {
      title: "Business info",
      description:
        `Name, address, phone, opening hours, booking rules and the current local date/time for ${business.name}. ` +
        "Call this to resolve relative dates like 'next Friday'.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      log(business, "get_business_info", "ok");
      return ok(await service.getBusinessInfo(business));
    },
  );

  if (business.kind === "salon") {
    server.registerTool(
      "get_services",
      {
        title: "Services and prices",
        description: "Lists the services offered, with duration and price. Optionally filter by a search phrase.",
        inputSchema: {
          query: z.string().max(100).optional().describe("Optional search, e.g. 'beard' or 'corte'."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query }) => {
        log(business, "get_services", "ok");
        return ok(await service.getCatalog(business, query));
      },
    );
  } else {
    server.registerTool(
      "get_menu",
      {
        title: "Menu",
        description:
          "Returns the menu grouped by category with prices. Optionally filter by a search phrase " +
          "(e.g. 'burger', 'vegetarian', 'nachos'). Gluten-free dishes are flagged only when the restaurant says so.",
        inputSchema: {
          query: z.string().max(100).optional().describe("Optional search phrase."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ query }) => {
        log(business, "get_menu", "ok");
        return ok(await service.getCatalog(business, query));
      },
    );

    server.registerTool(
      "check_dish",
      {
        title: "Dish details and allergens",
        description:
          "Details for one dish: description, price, gluten-free status and allergen information. " +
          "If allergens aren't published, say so and tell the customer to ask staff — never guess.",
        inputSchema: {
          dish: z.string().min(1).max(100).describe("Dish name as the customer said it."),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async ({ dish }) => {
        const result = await service.checkDish(business, dish);
        log(business, "check_dish", result.ok ? "ok" : result.code);
        return fromResult(result);
      },
    );
  }

  const serviceField: z.ZodRawShape =
    business.kind === "salon"
      ? { service: z.string().min(1).max(120).describe("Service name, e.g. 'Corte y Barba'.") }
      : {};
  const partyField: z.ZodRawShape =
    business.kind === "restaurant"
      ? {
          party_size: z
            .number()
            .int()
            .min(1)
            .max(100)
            .describe(`Number of people (max ${business.maxPartySize} through the assistant).`),
        }
      : {};

  server.registerTool(
    "check_availability",
    {
      title: "Check availability",
      description:
        "Free start times for a date. Returns start_time_ranges (compact, to read aloud) plus the exact start_times. " +
        "If the day is full or closed, suggests the next days with availability.",
      inputSchema: {
        date: z.string().min(1).max(40).describe(DATE_DESC),
        ...serviceField,
        ...partyField,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args: Record<string, unknown>) => {
      const result = await service.checkAvailability(business, args as AvailabilityArgs);
      log(business, "check_availability", result.ok ? "ok" : result.code);
      return fromResult(result);
    },
  );

  server.registerTool(
    "create_booking",
    {
      title: "Create booking",
      description:
        "Books a " +
        (business.kind === "restaurant" ? "table" : "appointment") +
        ". ONLY call this after reading the details back to the customer and getting an explicit yes. " +
        "Returns a 4-character reference to read back. If the time is taken, returns the nearest alternatives.",
      inputSchema: {
        date: z.string().min(1).max(40).describe(DATE_DESC),
        time: z.string().min(1).max(20).describe("Start time, 24h HH:MM (e.g. '17:30')."),
        ...serviceField,
        ...partyField,
        customer_name: z.string().min(1).max(80).describe("Customer's name."),
        customer_phone: z.string().min(6).max(30).describe("Customer's phone number."),
        notes: z.string().max(300).optional().describe("Optional note for the business."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args: Record<string, unknown>) => {
      const result = await service.createBooking(business, args as BookingArgs);
      log(business, "create_booking", result.ok ? "ok" : result.code);
      return fromResult(result);
    },
  );

  server.registerTool(
    "cancel_booking",
    {
      title: "Cancel booking",
      description:
        "Cancels a booking. Requires the 4-character reference AND the phone number used to book. " +
        "Confirm with the customer before calling.",
      inputSchema: {
        reference: z.string().min(4).max(12).describe("Booking reference, e.g. 'K7Q3'."),
        customer_phone: z.string().min(6).max(30).describe("Phone number used for the booking."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const result = await service.cancelBooking(business, args);
      log(business, "cancel_booking", result.ok ? "ok" : result.code);
      return fromResult(result);
    },
  );

  return server;
}
