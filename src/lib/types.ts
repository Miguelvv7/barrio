/** Core domain types shared by the MCP server, the dashboard and the stores. */

export type BusinessKind = "salon" | "restaurant";

/** 0 = Sunday … 6 = Saturday (same convention as Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** A single opening interval in the business's local wall-clock time, "HH:MM". */
export interface OpeningInterval {
  weekday: Weekday;
  opens: string;
  closes: string;
}

export interface Business {
  id: string;
  slug: string;
  name: string;
  kind: BusinessKind;
  /** One or two sentences, used by the assistant to introduce the business. */
  description: string;
  address: string;
  phone: string;
  /** IANA time zone, e.g. "Europe/Madrid". All booking times are wall-clock in this zone. */
  timezone: string;
  currency: string;
  /** How many bookings can overlap at the same time (chairs, tables…). */
  capacity: number;
  /** Granularity of bookable start times, in minutes. */
  slotStepMinutes: number;
  /** Restaurants only: how long a table is held, in minutes. */
  tableDurationMinutes: number;
  /** Restaurants only: largest party that can book through the assistant. */
  maxPartySize: number;
  hours: OpeningInterval[];
  /** Where to email the owner when a booking arrives through the assistant. Empty = no email. */
  notifyEmail: string;
  createdAt: string;
}

/** A bookable service (salon) — haircut, beard trim… */
export interface Service {
  id: string;
  businessId: string;
  name: string;
  description: string;
  durationMinutes: number;
  /** Price in the business currency. `priceFrom` means "from X" (final price varies). */
  price: number;
  priceFrom: boolean;
  active: boolean;
  /**
   * Other ways customers ask for it ("beard trim", "haircut and shave"). Alexa+ runs in English, so
   * English aliases let a Spanish-named service be found without the model having to translate.
   */
  aliases: string[];
}

/** A dish or drink on a restaurant menu. */
export interface MenuItem {
  id: string;
  businessId: string;
  category: string;
  name: string;
  description: string;
  price: number;
  /**
   * Only `true` when the business itself publishes the dish as gluten-free.
   * `null` means "not stated" — the assistant must never guess allergens.
   */
  glutenFree: boolean | null;
  /** Allergens declared by the business for this dish. Empty + allergensDeclared=false → unknown. */
  allergens: string[];
  allergensDeclared: boolean;
  available: boolean;
}

export type BookingStatus = "confirmed" | "cancelled";

export interface Booking {
  id: string;
  businessId: string;
  /** Short human-friendly code the customer can say back, e.g. "K7Q3". */
  reference: string;
  /** Local date in the business time zone, "YYYY-MM-DD". */
  date: string;
  /** Local start time, "HH:MM". */
  time: string;
  durationMinutes: number;
  serviceId: string | null;
  serviceName: string;
  partySize: number;
  customerName: string;
  customerPhone: string;
  notes: string;
  status: BookingStatus;
  /** Where the booking came from — "mcp" for assistant bookings, "dashboard" for manual ones. */
  source: "mcp" | "dashboard";
  createdAt: string;
}

export type NewBusiness = Omit<Business, "id" | "createdAt">;
export type NewService = Omit<Service, "id">;
export type NewMenuItem = Omit<MenuItem, "id">;
export type NewBooking = Omit<Booking, "id" | "reference" | "createdAt" | "status">;
