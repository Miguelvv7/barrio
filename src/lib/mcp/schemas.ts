/**
 * Output schemas (MCP `outputSchema`) for every tool. Alexa+ renders visuals from `structuredContent`
 * when a tool has no custom UI, and its certification rules require responses to match the declared
 * schema — so every field we return is declared here, and the tests validate them with the official
 * MCP client.
 */
import { z } from "zod";

const localNow = z.object({ date: z.string(), time: z.string(), weekday: z.string() });

export const businessOutput = {
  view: z.literal("business"),
  name: z.string(),
  type: z.enum(["salon", "restaurant"]),
  description: z.string(),
  address: z.string(),
  phone: z.string(),
  timezone: z.string(),
  currency: z.string(),
  local_now: localNow,
  opening_hours: z.array(z.object({ day: z.string(), open: z.boolean(), hours: z.string() })),
  booking_rules: z.object({
    min_notice_minutes: z.number(),
    max_days_ahead: z.number(),
    table_duration_minutes: z.number().optional(),
    max_party_size: z.number().optional(),
  }),
};

export const servicesOutput = {
  view: z.literal("services"),
  business: z.string(),
  type: z.literal("services"),
  items: z.array(
    z.object({
      id: z.string().describe("Stable id; can be passed as `service` to check_availability / create_booking."),
      name: z.string(),
      also_known_as: z.array(z.string()),
      description: z.string(),
      duration_minutes: z.number(),
      price: z.string().describe("Formatted price to read aloud."),
      price_amount: z.number(),
      price_is_minimum: z.boolean().describe("True when the price is 'from' — final price depends on the job."),
    }),
  ),
};

export const menuOutput = {
  view: z.literal("menu"),
  business: z.string(),
  type: z.literal("menu"),
  categories: z.array(
    z.object({
      category: z.string(),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          price: z.string(),
          price_amount: z.number(),
          gluten_free: z.boolean().describe("True only when the restaurant lists the dish as gluten-free."),
        }),
      ),
    }),
  ),
};

export const dishOutput = {
  view: z.literal("dish"),
  business: z.string(),
  dish: z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    description: z.string(),
    price: z.string(),
    price_amount: z.number(),
    available: z.boolean(),
    is_gluten_free: z.boolean(),
    allergens_published: z.boolean(),
    declared_allergens: z.array(z.string()),
    gluten_free: z.string().describe("Sentence to read aloud about gluten."),
    allergens: z.string().describe("Sentence to read aloud about allergens. Never add to it."),
  }),
};

export const availabilityOutput = {
  view: z.literal("availability"),
  business: z.string(),
  date: z.string(),
  weekday: z.string(),
  service: z.string(),
  duration_minutes: z.number(),
  party_size: z.number().optional(),
  available: z.boolean(),
  message: z.string().optional().describe("Why nothing is free that day."),
  next_available: z
    .array(z.object({ date: z.string(), weekday: z.string(), first_time: z.string() }))
    .optional(),
  start_time_ranges: z.array(z.string()).optional().describe("Compact ranges of possible START times, to read aloud."),
  note: z.string().optional(),
  start_times: z.array(z.string()).optional(),
};

export const bookingOutput = {
  view: z.literal("booking"),
  message: z.string(),
  booking: z.object({
    reference: z.string(),
    business: z.string(),
    address: z.string(),
    phone: z.string(),
    date: z.string(),
    weekday: z.string(),
    time: z.string(),
    duration_minutes: z.number(),
    service: z.string(),
    party_size: z.number(),
    customer_name: z.string(),
  }),
};

export const cancellationOutput = {
  view: z.literal("cancellation"),
  business: z.string(),
  reference: z.string(),
  date: z.string(),
  time: z.string(),
  message: z.string(),
};

export const directoryOutput = {
  view: z.literal("directory"),
  businesses: z.array(
    z.object({
      id: z.string().describe("Pass as `business` to the other tools."),
      name: z.string(),
      type: z.enum(["salon", "restaurant"]),
      description: z.string(),
      address: z.string(),
      phone: z.string(),
    }),
  ),
};
