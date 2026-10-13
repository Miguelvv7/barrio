import { after } from "next/server";
import { configuredBaseUrl } from "@/lib/base-url";
import type { BookingHooks } from "@/lib/booking-service";
import { sendBookingEmails } from "@/lib/notify";
import { getStore } from "@/lib/store";
import { formatPrice } from "@/lib/text";

/** Emails go out after the response is sent, so they never count against Alexa+'s latency budget. */
export function emailHooks(base: string): BookingHooks {
  return {
    onBooked: ({ business, booking, customerEmail }) =>
      after(async () => {
        let price: string | undefined;
        if (booking.serviceId) {
          const svc = (await getStore().listServices(business.id)).find((s) => s.id === booking.serviceId);
          if (svc) price = formatPrice(svc.price, business.currency, svc.priceFrom);
        }
        await sendBookingEmails({ base, business, booking, customerEmail, price });
      }),
  };
}

/** Base for links in emails: the configured public URL, else the origin the request came in on. */
export function publicBase(origin: string) {
  return configuredBaseUrl() ?? origin;
}
