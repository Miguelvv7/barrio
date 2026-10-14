/**
 * Directory mode: ONE MCP server (/api/mcp) in front of every business on Barrio.
 *
 * Why: each Alexa+ add-on needs its own store listing, assets and certification — no corner barber
 * will go through that. A single certified "Barrio" add-on lets any business on the platform be
 * reached by voice ("Alexa, ask Barrio for a haircut at La Familia tomorrow"). Every tool takes a
 * `business` (id from find_businesses, or the name) and otherwise behaves exactly like the
 * per-business server.
 *
 * Only trusted businesses (created by the admin) are listed and resolved here. Anyone can create a
 * sandbox business, so letting one named "La Familia" answer for the real one would hand it the
 * customers' names and phone numbers. Sandboxes stay reachable on their own /api/mcp/<slug>.
 */
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { BookingService } from "../booking-service";
import type { Store } from "../store/types";
import { fold, rank, wantsGlutenFree } from "../text";
import type { Business } from "../types";
import {
  availabilityOutput,
  bookingOutput,
  businessOutput,
  cancellationOutput,
  directoryOutput,
  dishOutput,
  menuOutput,
  servicesOutput,
} from "./schemas";
import { DATE_DESC, failure, fromResult, guard, log, registerCardResource, SERVER_VERSION, success, TIME_DESC, uiMeta } from "./server";

const KIND_WORDS: Record<Business["kind"], string[]> = {
  salon: ["barber", "barbershop", "hair", "haircut", "salon", "beard", "peluqueria", "barberia", "corte"],
  restaurant: ["restaurant", "food", "eat", "dinner", "lunch", "table", "menu", "restaurante", "comer", "cena", "mesa"],
};

function err(code: string, error: string, extra: Record<string, unknown> = {}): CallToolResult {
  return failure({ code, error, ...extra });
}

/** Logs unresolved/mismatched business lookups too — every tool call gets a log line. */
function logged(result: CallToolResult, tool: string, startedAt: number): CallToolResult {
  const code = (() => {
    try {
      return JSON.parse((result.content as { text: string }[])[0].text).code as string;
    } catch {
      return "error";
    }
  })();
  log({ slug: "directory" }, tool, code, startedAt);
  return result;
}

export function buildDirectoryServer(store: Store, service: BookingService): McpServer {
  const server = new McpServer(
    { name: "barrio", title: "Barrio — local businesses", version: SERVER_VERSION },
    {
      instructions: [
        "You are Barrio: you connect customers with small local businesses (barbers, restaurants…) and book for them.",
        "Use find_businesses to discover businesses; every other tool needs `business` (an id from find_businesses, or the name).",
        "Booking flow: check_availability → read back business, date, time, service or party size, name and phone → only after an explicit yes, create_booking → read back the reference.",
        "Never invent prices, dishes, allergens or opening hours. Never read ids, codes or JSON to the customer.",
      ].join("\n"),
      capabilities: { resources: {} },
    },
  );
  registerCardResource(server);

  const listed = async () => (await store.listBusinesses()).filter((b) => b.trusted);

  async function resolve(input: unknown): Promise<{ business: Business } | { error: CallToolResult }> {
    const q = String(input ?? "").trim();
    const all = await listed();
    const bySlug = all.find((b) => b.slug === q);
    if (bySlug) return { business: bySlug };
    const ranked = rank(q, all, (b) => [b.name, b.slug.replace(/-/g, " ")]);
    const [first, second] = ranked;
    if (!first || first.score < 0.5) {
      return { error: err("business_not_found", `No business called "${q}". Use find_businesses.`, { options: all.slice(0, 8).map((b) => b.name) }) };
    }
    // Two equally good matches (even two exact names) are never decided by list order; an exact name
    // still wins over a longer one that contains it.
    if (second && (first.score < 1 ? first.score - second.score < 0.1 : second.score >= 1)) {
      return { error: err("business_ambiguous", `"${q}" matches several businesses. Ask which one.`, { options: ranked.slice(0, 4).map((r) => r.item.name) }) };
    }
    return { business: first.item };
  }

  /**
   * Businesses whose own services or dishes answer the query ("guacamole", "beard trim"), and, for
   * "gluten free", only restaurants that flag at least one dish as gluten-free. Catalogs are cached.
   */
  async function catalogMatches(q: string, list: Business[]): Promise<Business[]> {
    const gf = wantsGlutenFree(q);
    const found = await Promise.all(
      list.map(async (b) => {
        if (b.kind === "salon") {
          const services = await store.listServices(b.id);
          return !gf.glutenFree && rank(q, services, (s) => [s.name, ...s.aliases]).some((r) => r.score >= 0.6);
        }
        const menu = (await store.listMenu(b.id)).filter((m) => m.available);
        if (gf.glutenFree) return menu.some((m) => m.glutenFree === true);
        return rank(q, menu, (m) => [m.name, m.category]).some((r) => r.score >= 0.6);
      }),
    );
    return list.filter((_, i) => found[i]);
  }

  const businessArg = {
    business: z.string().min(1).max(120).describe("Business id from find_businesses (e.g. 'la-familia') or its name."),
  };
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  const findStatus = { invoking: "Finding businesses…", invoked: "Businesses on Barrio" };
  registerAppTool(
    server,
    "find_businesses",
    {
      title: "Find businesses",
      description:
        "Lists businesses on Barrio, optionally filtered by what the customer wants ('barber', 'tacos', 'haircut', 'restaurant') or by name. " +
        "Call it first when the customer doesn't name a business, or to get a business id.",
      inputSchema: {
        query: z.string().max(100).optional().describe("What or who the customer is looking for."),
        type: z.enum(["salon", "restaurant"]).optional().describe("Filter by type."),
      },
      outputSchema: directoryOutput,
      annotations: readOnly,
      _meta: uiMeta(findStatus),
    },
    guard("find_businesses", async ({ query, type }) => {
      const t = performance.now();
      let list = (await listed()).filter((b) => !type || b.kind === type);
      const q = query?.trim();
      if (q) {
        const words = fold(q).split(" ");
        const byKind = list.filter((b) => KIND_WORDS[b.kind].some((w) => words.includes(w)));
        const byText = rank(q, list, (b) => [b.name, `${b.name} ${b.description}`, `${b.name} ${b.descriptionEn}`]).filter((r) => r.score >= 0.3).map((r) => r.item);
        const byCatalog = await catalogMatches(q, list);
        list = [...new Map([...byText, ...byKind, ...byCatalog].map((b) => [b.id, b])).values()];
      }
      log({ slug: "directory" }, "find_businesses", "ok", t);
      return success(
        {
          view: "directory",
          businesses: list.slice(0, 20).map((b) => ({
            id: b.slug,
            name: b.name,
            type: b.kind,
            description: b.description,
            description_en: b.descriptionEn,
            address: b.address,
            phone: b.phone,
          })),
        },
        findStatus,
      );
    }),
  );

  const infoStatus = { invoking: "Looking up the details…", invoked: "Here are the details" };
  registerAppTool(
    server,
    "get_business_info",
    {
      title: "Business info",
      description: "Address, phone, opening hours, booking rules and local date/time for one business.",
      inputSchema: businessArg,
      outputSchema: businessOutput,
      annotations: readOnly,
      _meta: uiMeta(infoStatus),
    },
    guard("get_business_info", async ({ business }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "get_business_info", t);
      log(r.business, "get_business_info", "ok", t);
      return success(await service.getBusinessInfo(r.business), infoStatus);
    }),
  );

  const svcStatus = { invoking: "Checking services…", invoked: "Services and prices" };
  registerAppTool(
    server,
    "get_services",
    {
      title: "Services and prices",
      description: "Services with duration and price for an appointment business (barber, salon). English aliases work ('beard trim').",
      inputSchema: { ...businessArg, query: z.string().max(100).optional().describe("Optional search.") },
      outputSchema: servicesOutput,
      annotations: readOnly,
      _meta: uiMeta(svcStatus),
    },
    guard("get_services", async ({ business, query }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "get_services", t);
      if (r.business.kind !== "salon") return logged(err("wrong_type", `${r.business.name} is a restaurant — use get_menu.`), "get_services", t);
      log(r.business, "get_services", "ok", t);
      return success(await service.getCatalog(r.business, query), svcStatus);
    }),
  );

  const menuStatus = { invoking: "Opening the menu…", invoked: "Here's the menu" };
  registerAppTool(
    server,
    "get_menu",
    {
      title: "Menu",
      description: "A restaurant's menu by category with prices; optional search ('burger', 'nachos'). Gluten-free flagged only when the restaurant says so.",
      inputSchema: { ...businessArg, query: z.string().max(100).optional().describe("Optional search.") },
      outputSchema: menuOutput,
      annotations: readOnly,
      _meta: uiMeta(menuStatus),
    },
    guard("get_menu", async ({ business, query }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "get_menu", t);
      if (r.business.kind !== "restaurant") return logged(err("wrong_type", `${r.business.name} isn't a restaurant — use get_services.`), "get_menu", t);
      log(r.business, "get_menu", "ok", t);
      return success(await service.getCatalog(r.business, query), menuStatus);
    }),
  );

  const dishStatus = { invoking: "Checking that dish…", invoked: "Dish details" };
  registerAppTool(
    server,
    "check_dish",
    {
      title: "Dish details and allergens",
      description: "One dish at a restaurant: price, gluten-free status, allergens. Never guess allergens — if unpublished, tell the customer to ask staff.",
      inputSchema: { ...businessArg, dish: z.string().min(1).max(100).describe("Dish name as the customer said it.") },
      outputSchema: dishOutput,
      annotations: readOnly,
      _meta: uiMeta(dishStatus),
    },
    guard("check_dish", async ({ business, dish }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "check_dish", t);
      const result = await service.checkDish(r.business, dish);
      log(r.business, "check_dish", result.ok ? "ok" : result.code, t);
      return fromResult(result, dishStatus, r.business);
    }),
  );

  const bookingFields = {
    service: z.string().min(1).max(120).optional().describe("Appointments only: service name, id or English alias."),
    party_size: z.coerce.number().int().min(1).max(100).optional().describe("Restaurants only: number of people."),
  };

  const availStatus = { invoking: "Checking free times…", invoked: "Free times" };
  registerAppTool(
    server,
    "check_availability",
    {
      title: "Check availability",
      description: "Free start times at a business for one date. Appointments need `service`; restaurants need `party_size`.",
      inputSchema: { ...businessArg, date: z.string().min(1).max(40).describe(DATE_DESC), ...bookingFields },
      outputSchema: availabilityOutput,
      annotations: readOnly,
      _meta: uiMeta(availStatus),
    },
    guard("check_availability", async ({ business, ...args }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "check_availability", t);
      const result = await service.checkAvailability(r.business, args);
      log(r.business, "check_availability", result.ok ? "ok" : result.code, t);
      return fromResult(result, availStatus, r.business);
    }),
  );

  const bookStatus = { invoking: "Booking…", invoked: "You're booked" };
  registerAppTool(
    server,
    "create_booking",
    {
      title: "Create booking",
      description:
        "Books at a business. ONLY after reading the details back and getting an explicit yes. Returns a 4-character reference to read back.",
      inputSchema: {
        ...businessArg,
        date: z.string().min(1).max(40).describe(DATE_DESC),
        time: z.string().min(1).max(20).describe(TIME_DESC),
        ...bookingFields,
        customer_name: z.string().min(1).max(80).describe("Customer's name."),
        customer_phone: z.string().min(6).max(30).describe("Customer's phone number."),
        customer_email: z.string().max(120).optional().describe("Optional, for an email confirmation."),
        notes: z.string().max(300).optional().describe("Optional note for the business."),
      },
      outputSchema: bookingOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: uiMeta(bookStatus),
    },
    guard("create_booking", async ({ business, ...args }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "create_booking", t);
      const result = await service.createBooking(r.business, args);
      log(r.business, "create_booking", result.ok ? "ok" : result.code, t);
      return fromResult(result, bookStatus, r.business);
    }),
  );

  const cancelStatus = { invoking: "Cancelling…", invoked: "Booking cancelled" };
  registerAppTool(
    server,
    "cancel_booking",
    {
      title: "Cancel booking",
      description: "Cancels an upcoming booking at a business. Needs the reference AND the phone used to book. Confirm first.",
      inputSchema: {
        ...businessArg,
        reference: z.string().min(4).max(12).describe("Booking reference, e.g. 'K7Q3'."),
        customer_phone: z.string().min(6).max(30).describe("Phone number used for the booking."),
      },
      outputSchema: cancellationOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      _meta: uiMeta(cancelStatus),
    },
    guard("cancel_booking", async ({ business, ...args }) => {
      const t = performance.now();
      const r = await resolve(business);
      if ("error" in r) return logged(r.error, "cancel_booking", t);
      const result = await service.cancelBooking(r.business, args);
      log(r.business, "cancel_booking", result.ok ? "ok" : result.code, t);
      return fromResult(result, cancelStatus, r.business);
    }),
  );

  return server;
}
