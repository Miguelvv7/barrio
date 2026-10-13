/**
 * Builds one MCP server per business ("tenant").
 *
 * Designed against the Alexa+ MCP Toolkit guidance:
 *  - one tool per customer intent, descriptions that say when to call it and what it returns;
 *  - every tool declares an `outputSchema` and returns matching `structuredContent` (Alexa+ renders
 *    native visuals from it), plus the same JSON as text for clients that only read `content`;
 *  - every tool links an MCP App (`ui://` resource, `text/html;profile=mcp-app`) that Alexa+ renders
 *    on screen devices like Echo Show; voice-only devices just use the data;
 *  - failures use the MCP error contract (`isError: true`) with an actionable message.
 */
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { BookingService, Result } from "../booking-service";
import { WEEKDAY_NAMES_EN } from "../time";
import type { Business } from "../types";
import { APP_HASH, APP_HTML } from "./app-html.generated";
import {
  availabilityOutput,
  bookingOutput,
  businessOutput,
  cancellationOutput,
  dishOutput,
  menuOutput,
  servicesOutput,
} from "./schemas";

export const SERVER_VERSION = "1.1.0";

/** Versioned by content hash so hosts never show a stale UI after a deploy (Alexa+ guidance). */
export const APP_URI = `ui://barrio/card-${APP_HASH}.html`;

type AvailabilityArgs = Parameters<BookingService["checkAvailability"]>[1];
type BookingArgs = Parameters<BookingService["createBooking"]>[1];

interface UiStatus {
  invoking: string;
  invoked: string;
}

function uiMeta(status: UiStatus) {
  return { ui: { resourceUri: APP_URI, ...status } };
}

function success(data: Record<string, unknown>, status: UiStatus): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
    _meta: uiMeta(status),
  };
}

function fromResult(result: Result<Record<string, unknown>>, status: UiStatus): CallToolResult {
  const { ok, ...rest } = result;
  if (ok) return success(rest, status);
  return { isError: true, content: [{ type: "text", text: JSON.stringify(rest, null, 2) }] };
}

function log(business: Business, tool: string, outcome: string, startedAt: number) {
  // Structured, PII-free log line — tool, outcome and latency per call (Alexa+ asks you to log every call).
  console.log(
    JSON.stringify({ evt: "mcp_tool", tenant: business.slug, tool, outcome, ms: Math.round(performance.now() - startedAt) }),
  );
}

function instructionsFor(business: Business): string {
  const what =
    business.kind === "restaurant"
      ? "You can answer menu questions (get_menu, check_dish) and reserve tables."
      : "You can list services and prices (get_services) and book appointments. Service names are in Spanish; each has English aliases.";
  return [
    `You are the voice assistant for ${business.name}. ${business.description}`,
    what,
    "Call get_business_info first if you need today's date, opening hours, address or phone.",
    "Booking flow: check_availability → read back the date, time, " +
      (business.kind === "restaurant" ? "party size" : "service") +
      ", name and phone to the customer → only after they say yes, call create_booking → read back the reference code.",
    "Never invent prices, dishes, allergens or opening hours: only use what the tools return.",
    "Never read tool names, codes, ids or JSON to the customer.",
  ].join("\n");
}

const DATE_DESC =
  "Date of the visit. Prefer YYYY-MM-DD. Also accepts 'today', 'tomorrow', a weekday name (next occurrence), " +
  "'this <weekday>', 'next <weekday>', and Spanish equivalents ('mañana', 'el viernes'). Business-local time zone.";

const TIME_DESC = "Start time, 24h HH:MM (e.g. '17:30'). Also accepts '5:30 pm', '5:30pm', '1730'.";

function profileMarkdown(business: Business): string {
  const days = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const shifts = business.hours
      .filter((h) => h.weekday === wd)
      .sort((a, b) => a.opens.localeCompare(b.opens))
      .map((h) => `${h.opens}–${h.closes}`);
    return `- ${WEEKDAY_NAMES_EN[wd]}: ${shifts.join(", ") || "closed"}`;
  });
  return [
    `# ${business.name}`,
    "",
    business.description,
    "",
    `Address: ${business.address}`,
    `Phone: ${business.phone}`,
    "",
    "## Opening hours",
    ...days,
  ].join("\n");
}

export function buildMcpServer(business: Business, service: BookingService): McpServer {
  const server = new McpServer(
    { name: `barrio-${business.slug}`, title: `${business.name} (Barrio)`, version: SERVER_VERSION },
    { instructions: instructionsFor(business), capabilities: { resources: {} } },
  );

  // --- MCP App (Echo Show card) -------------------------------------------------------------
  registerAppResource(
    server,
    "Barrio card",
    APP_URI,
    {
      description: "Booking, menu and availability cards for screen devices.",
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false } },
    },
    async () => ({
      contents: [{ uri: APP_URI, mimeType: RESOURCE_MIME_TYPE, text: APP_HTML }],
    }),
  );

  // --- Plain resource: the business profile --------------------------------------------------
  server.registerResource(
    "Business profile",
    `barrio://${business.slug}/profile`,
    { title: `${business.name} — profile`, description: "Address, phone and opening hours.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: profileMarkdown(business) }] }),
  );

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  registerAppTool(
    server,
    "get_business_info",
    {
      title: "Business info",
      description:
        `Address, phone, opening hours, booking rules and the current local date/time for ${business.name}. ` +
        "Call it when the customer asks where the business is, when it's open, or to resolve relative dates like 'next Friday'.",
      inputSchema: {},
      outputSchema: businessOutput,
      annotations: readOnly,
      _meta: uiMeta({ invoking: "Looking up the details…", invoked: "Here are the details" }),
    },
    async () => {
      const t = performance.now();
      const data = await service.getBusinessInfo(business);
      log(business, "get_business_info", "ok", t);
      return success(data, { invoking: "Looking up the details…", invoked: "Here are the details" });
    },
  );

  if (business.kind === "salon") {
    const status = { invoking: "Checking services…", invoked: "Services and prices" };
    registerAppTool(
      server,
      "get_services",
      {
        title: "Services and prices",
        description:
          "Lists the services offered with duration and price. Call it when the customer asks what's available or how much something costs. " +
          "Optionally filter with a phrase in English or Spanish (e.g. 'beard', 'haircut', 'corte').",
        inputSchema: {
          query: z.string().max(100).optional().describe("Optional search, e.g. 'beard trim', 'haircut', 'barba'."),
        },
        outputSchema: servicesOutput,
        annotations: readOnly,
        _meta: uiMeta(status),
      },
      async ({ query }) => {
        const t = performance.now();
        const data = await service.getCatalog(business, query);
        log(business, "get_services", "ok", t);
        return success(data, status);
      },
    );
  } else {
    const menuStatus = { invoking: "Opening the menu…", invoked: "Here's the menu" };
    registerAppTool(
      server,
      "get_menu",
      {
        title: "Menu",
        description:
          "Returns the menu grouped by category with prices. Call it when the customer asks what there is to eat or drink. " +
          "Optionally filter with a phrase (e.g. 'burger', 'hamburguesa', 'nachos', 'salad'). " +
          "Gluten-free dishes are flagged only when the restaurant says so.",
        inputSchema: { query: z.string().max(100).optional().describe("Optional search phrase.") },
        outputSchema: menuOutput,
        annotations: readOnly,
        _meta: uiMeta(menuStatus),
      },
      async ({ query }) => {
        const t = performance.now();
        const data = await service.getCatalog(business, query);
        log(business, "get_menu", "ok", t);
        return success(data, menuStatus);
      },
    );

    const dishStatus = { invoking: "Checking that dish…", invoked: "Dish details" };
    registerAppTool(
      server,
      "check_dish",
      {
        title: "Dish details and allergens",
        description:
          "Details for ONE dish: description, price, gluten-free status and allergens. Call it when the customer asks about a specific dish. " +
          "If allergens aren't published it says so — tell the customer to ask the staff; never guess. " +
          "If the name matches several dishes it returns the options to ask about.",
        inputSchema: { dish: z.string().min(1).max(100).describe("Dish name as the customer said it (Spanish names work best).") },
        outputSchema: dishOutput,
        annotations: readOnly,
        _meta: uiMeta(dishStatus),
      },
      async ({ dish }) => {
        const t = performance.now();
        const result = await service.checkDish(business, dish);
        log(business, "check_dish", result.ok ? "ok" : result.code, t);
        return fromResult(result, dishStatus);
      },
    );
  }

  const serviceField: z.ZodRawShape =
    business.kind === "salon"
      ? {
          service: z
            .string()
            .min(1)
            .max(120)
            .describe("Service name or id from get_services. English aliases work: 'haircut', 'beard trim', 'haircut and beard'."),
        }
      : {};
  const partyField: z.ZodRawShape =
    business.kind === "restaurant"
      ? {
          party_size: z
            .number()
            .int()
            .min(1)
            .max(100)
            .describe(`Number of people (max ${business.maxPartySize} through the assistant; larger groups must call).`),
        }
      : {};

  const availStatus = { invoking: "Checking free times…", invoked: "Free times" };
  registerAppTool(
    server,
    "check_availability",
    {
      title: "Check availability",
      description:
        "Free start times for one date. Call it before booking, or when the customer asks 'are you free…'. " +
        "Returns start_time_ranges (compact, to read aloud) plus the exact start_times. " +
        "If the day is full or closed, returns the next days with availability.",
      inputSchema: { date: z.string().min(1).max(40).describe(DATE_DESC), ...serviceField, ...partyField },
      outputSchema: availabilityOutput,
      annotations: readOnly,
      _meta: uiMeta(availStatus),
    },
    async (args: Record<string, unknown>) => {
      const t = performance.now();
      const result = await service.checkAvailability(business, args as AvailabilityArgs);
      log(business, "check_availability", result.ok ? "ok" : result.code, t);
      return fromResult(result, availStatus);
    },
  );

  const bookStatus = { invoking: "Booking…", invoked: "You're booked" };
  registerAppTool(
    server,
    "create_booking",
    {
      title: "Create booking",
      description:
        "Books " +
        (business.kind === "restaurant" ? "a table" : "an appointment") +
        ". ONLY call it after reading the details back to the customer and getting an explicit yes. " +
        "Returns a 4-character reference to read back letter by letter. If the time was just taken, returns the nearest alternatives.",
      inputSchema: {
        date: z.string().min(1).max(40).describe(DATE_DESC),
        time: z.string().min(1).max(20).describe(TIME_DESC),
        ...serviceField,
        ...partyField,
        customer_name: z.string().min(1).max(80).describe("Customer's name."),
        customer_phone: z.string().min(6).max(30).describe("Customer's phone number (any format)."),
        notes: z.string().max(300).optional().describe("Optional note for the business."),
      },
      outputSchema: bookingOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: uiMeta(bookStatus),
    },
    async (args: Record<string, unknown>) => {
      const t = performance.now();
      const result = await service.createBooking(business, args as BookingArgs);
      log(business, "create_booking", result.ok ? "ok" : result.code, t);
      return fromResult(result, bookStatus);
    },
  );

  const cancelStatus = { invoking: "Cancelling…", invoked: "Booking cancelled" };
  registerAppTool(
    server,
    "cancel_booking",
    {
      title: "Cancel booking",
      description:
        "Cancels an upcoming booking. Requires the 4-character reference AND the phone number used to book. " +
        "Confirm with the customer before calling.",
      inputSchema: {
        reference: z.string().min(4).max(12).describe("Booking reference, e.g. 'K7Q3' (spaces and dashes are ignored)."),
        customer_phone: z.string().min(6).max(30).describe("Phone number used for the booking."),
      },
      outputSchema: cancellationOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      _meta: uiMeta(cancelStatus),
    },
    async (args) => {
      const t = performance.now();
      const result = await service.cancelBooking(business, args);
      log(business, "cancel_booking", result.ok ? "ok" : result.code, t);
      return fromResult(result, cancelStatus);
    },
  );

  return server;
}
