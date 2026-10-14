/** Validation for everything the dashboard writes. Server-side only; never trust the browser. */
import { z } from "zod";
import { fold } from "./text";
import { isValidTime, toMinutes } from "./time";
import type { NewBusiness, OpeningInterval, Weekday } from "./types";

export const RESERVED_SLUGS = new Set([
  "new", "api", "dashboard", "login", "logout", "try", "admin", "static", "_next",
  // Other routes and names the app uses ("directory" is the directory server's log tenant).
  "cancel", "privacy", "terms", "alexa", "screens", "directory", "oauth", "cron", "calendar", "assistant",
]);

export const EU_ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "tree nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export function slugify(name: string): string {
  return fold(name)
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Max ${max} characters`)
    .transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ""));
const int = (min: number, max: number, label: string) =>
  z.coerce.number({ message: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`);
const money = z.coerce.number({ message: "Price must be a number" }).min(0, "Price can't be negative").max(10_000, "Price too high").transform((n) => Math.round(n * 100) / 100);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

function obj(form: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(form.entries());
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

function result<T>(parsed: z.ZodSafeParseResult<T>): FormResult<T> {
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, error: issue?.message ?? "Invalid input" };
}

const businessBase = z.object({
  name: text(120).pipe(z.string().min(1, "Name is required")),
  description: text(400),
  // Absent (a form without the field) means "keep what's there", like aliases.
  descriptionEn: text(400).optional(),
  address: text(200),
  phone: text(30),
});

export function parseNewBusiness(form: FormData): FormResult<NewBusiness> {
  const parsed = businessBase
    .extend({
      kind: z.enum(["salon", "restaurant"], { message: "Choose a business type" }),
      slug: text(48).optional(),
    })
    .safeParse(obj(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const slug = d.slug ? slugify(d.slug) : slugify(d.name);
  if (!SLUG_RE.test(slug)) return { ok: false, error: "Use letters and numbers for the web address" };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: `"${slug}" is reserved — pick another web address` };
  const restaurant = d.kind === "restaurant";
  return {
    ok: true,
    data: {
      slug,
      name: d.name,
      kind: d.kind,
      description: d.description,
      descriptionEn: d.descriptionEn ?? "",
      address: d.address,
      phone: d.phone,
      timezone: "Europe/Madrid",
      currency: "EUR",
      capacity: restaurant ? 8 : 1,
      slotStepMinutes: restaurant ? 30 : 15,
      tableDurationMinutes: restaurant ? 90 : 0,
      maxPartySize: restaurant ? 10 : 1,
      notifyEmail: "",
      trusted: false,
      hours: ([1, 2, 3, 4, 5] as Weekday[]).flatMap((weekday) => [
        { weekday, opens: restaurant ? "13:00" : "09:00", closes: restaurant ? "16:00" : "14:00" },
        { weekday, opens: restaurant ? "20:00" : "17:00", closes: restaurant ? "23:30" : "20:00" },
      ]),
    },
  };
}

export function parseBusinessSettings(form: FormData, kind: "salon" | "restaurant"): FormResult<Partial<NewBusiness>> {
  const schema = businessBase.extend({
    notifyEmail: z
      .string()
      .trim()
      .max(120)
      .refine((v) => v === "" || EMAIL_RE.test(v), "That email address doesn't look right")
      .default(""),
    capacity: int(1, 200, kind === "restaurant" ? "Tables" : "Chairs"),
    slotStepMinutes: z.coerce.number().refine((n) => [5, 10, 15, 20, 30, 60].includes(n), "Pick a valid time grid"),
    // Salon forms don't send these at all: they must be optional, not just ignored.
    tableDurationMinutes: kind === "restaurant" ? int(30, 300, "Table time") : z.unknown().optional().transform(() => undefined),
    maxPartySize: kind === "restaurant" ? int(1, 100, "Largest group") : z.unknown().optional().transform(() => undefined),
  });
  const parsed = schema.safeParse(obj(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { tableDurationMinutes, maxPartySize, descriptionEn, ...rest } = parsed.data;
  const data: Partial<NewBusiness> = { ...rest };
  if (descriptionEn !== undefined) data.descriptionEn = descriptionEn;
  if (typeof tableDurationMinutes === "number") data.tableDurationMinutes = tableDurationMinutes;
  if (typeof maxPartySize === "number") data.maxPartySize = maxPartySize;
  return { ok: true, data };
}

export function parseService(form: FormData) {
  return result(
    z
      .object({
        id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
        name: text(120).pipe(z.string().min(1, "Service name is required")),
        description: text(300),
        descriptionEn: text(300).optional(),
        durationMinutes: int(5, 600, "Duration"),
        price: money,
        priceFrom: checkbox,
        active: checkbox,
        // Absent (a form without the field) means "keep the current aliases", not "delete them".
        aliases: text(400)
          .transform((s) =>
            [...new Set(s.split(",").map((a) => a.trim()).filter((a) => a.length > 1))].slice(0, 12).map((a) => a.slice(0, 60)),
          )
          .optional(),
      })
      .safeParse(obj(form)),
  );
}

export function parseMenuItem(form: FormData) {
  const raw = obj(form);
  const allergens = form.getAll("allergens").map(String).filter((a) => (EU_ALLERGENS as readonly string[]).includes(a));
  return result(
    z
      .object({
        id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
        category: text(60),
        name: text(120).pipe(z.string().min(1, "Dish name is required")),
        description: text(400),
        descriptionEn: text(400).optional(),
        price: money,
        glutenFree: z.enum(["yes", "unknown"]).transform((v) => (v === "yes" ? true : null)),
        allergensDeclared: checkbox,
        available: checkbox,
      })
      .transform((d) => ({ ...d, allergens: d.allergensDeclared ? allergens : [] }))
      .refine((d) => !(d.glutenFree && d.allergens.includes("gluten")), "A dish can't be gluten-free and contain gluten — change one of the two.")
      .safeParse(raw),
  );
}

/** Each weekday posts up to two intervals: d{n}_open1, d{n}_close1, d{n}_open2, d{n}_close2. */
export function parseHours(form: FormData): FormResult<OpeningInterval[]> {
  const hours: OpeningInterval[] = [];
  for (let wd = 0 as Weekday; wd <= 6; wd = (wd + 1) as Weekday) {
    const intervals: OpeningInterval[] = [];
    for (const n of [1, 2]) {
      const opens = String(form.get(`d${wd}_open${n}`) ?? "").trim();
      let closes = String(form.get(`d${wd}_close${n}`) ?? "").trim();
      if (!opens && !closes) continue;
      // Closing at midnight: a time picker can only say 00:00, which would read as "before opening".
      if (closes === "00:00" || closes === "24:00") closes = "24:00";
      if (!isValidTime(opens) || !(isValidTime(closes) || closes === "24:00")) {
        return { ok: false, error: "Use HH:MM times (e.g. 09:30)" };
      }
      if (toMinutes(opens) >= toMinutes(closes)) {
        return { ok: false, error: `Closing time must be after opening time (${opens}–${closes})` };
      }
      intervals.push({ weekday: wd, opens, closes });
    }
    intervals.sort((a, b) => toMinutes(a.opens) - toMinutes(b.opens));
    if (intervals.length === 2 && toMinutes(intervals[1].opens) < toMinutes(intervals[0].closes)) {
      return { ok: false, error: "The two shifts on one day overlap" };
    }
    hours.push(...intervals);
    if (wd === 6) break;
  }
  return { ok: true, data: hours };
}
