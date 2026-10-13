/**
 * Booking emails, sent after the MCP response (never on Alexa+'s 500 ms path):
 *  - to the customer, if they gave an email: reference, date/time, price, address, phone and a
 *    cancel link — what the Alexa+ design guide asks confirmation emails to contain;
 *  - to the owner, if they set "Email me new bookings": a short Spanish summary.
 * Uses Resend's HTTP API when RESEND_API_KEY + BARRIO_EMAIL_FROM are set; otherwise does nothing.
 */
import type { Booking, Business } from "./types";
import { formatPrice } from "./text";
import { WEEKDAY_NAMES_EN, WEEKDAY_NAMES_ES, weekdayOf } from "./time";

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function cancelUrl(base: string, business: Business, booking: Booking) {
  return `${base}/cancel/${business.slug}?ref=${encodeURIComponent(booking.reference)}`;
}

export function customerEmail(base: string, business: Business, booking: Booking, to: string, price?: string): Email {
  const wd = weekdayOf(booking.date);
  const what = business.kind === "restaurant" ? `Table for ${booking.partySize}` : booking.serviceName;
  const queEs = business.kind === "restaurant" ? `Mesa para ${booking.partySize}` : booking.serviceName;
  const link = cancelUrl(base, business, booking);
  const rows: [string, string][] = [
    ["Reference / Referencia", booking.reference],
    ["When / Cuándo", `${WEEKDAY_NAMES_EN[wd]} ${booking.date}, ${booking.time} · ${WEEKDAY_NAMES_ES[wd]}`],
    ["What / Qué", business.kind === "restaurant" ? `${what} · ${queEs}` : what],
    ...(price ? ([["Price / Precio", price]] as [string, string][]) : []),
    ["Where / Dónde", business.address],
    ["Questions / Dudas", business.phone],
  ];
  const html = `<!doctype html><html><body style="margin:0;background:#f5efe3;font-family:Helvetica,Arial,sans-serif;color:#1c1915">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#56663a;margin:0">${esc(business.name)}</p>
<h1 style="font-family:Georgia,serif;font-weight:500;font-size:30px;margin:8px 0 4px">You're booked · Reserva confirmada</h1>
<p style="margin:0 0 20px;color:#5e5448">Hi ${esc(booking.customerName)} — see you soon. / ¡Hasta pronto!</p>
<table style="width:100%;border-collapse:collapse;background:#fffaf1;border:1.5px solid #1c1915;border-radius:6px">
${rows.map(([k, v]) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #e7dfd0;font-size:13px;color:#5e5448;white-space:nowrap">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #e7dfd0;font-weight:600">${esc(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:22px 0"><a href="${esc(link)}" style="background:#b9472a;color:#fff8ee;text-decoration:none;padding:11px 18px;border-radius:999px;font-weight:600">Cancel or manage · Cancelar</a></p>
<p style="font-size:12px;color:#5e5448">Booked by voice with Alexa+ through Barrio. To cancel you'll need your reference and the phone number you booked with.</p>
</div></body></html>`;
  const text = [
    `${business.name} — You're booked / Reserva confirmada`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Cancel / Cancelar: ${link}`,
  ].join("\n");
  return { to, subject: `Booking ${booking.reference} · ${business.name}`, html, text };
}

export function ownerEmail(base: string, business: Business, booking: Booking): Email {
  const wd = weekdayOf(booking.date);
  const what = business.kind === "restaurant" ? `Mesa para ${booking.partySize}` : booking.serviceName;
  const dashboard = `${base}/dashboard/${business.slug}#agenda`;
  const lines = [
    `${what} — ${WEEKDAY_NAMES_ES[wd]} ${booking.date} a las ${booking.time}`,
    `Cliente: ${booking.customerName}${booking.customerPhone ? ` · ${booking.customerPhone}` : ""}`,
    ...(booking.notes ? [`Nota: ${booking.notes}`] : []),
    `Referencia: ${booking.reference}`,
  ];
  const html = `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;color:#1c1915;background:#f5efe3;margin:0">
<div style="max-width:520px;margin:0 auto;padding:24px 20px">
<h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;margin:0 0 12px">Nueva reserva por Alexa+</h1>
${lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join("")}
<p style="margin:18px 0"><a href="${esc(dashboard)}" style="color:#b9472a;font-weight:600">Ver la agenda</a></p>
</div></body></html>`;
  return { to: business.notifyEmail, subject: `Nueva reserva: ${what}, ${booking.date} ${booking.time}`, html, text: [...lines, dashboard].join("\n") };
}

export type Sender = (email: Email) => Promise<void>;

export function resendSender(): Sender | null {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.BARRIO_EMAIL_FROM;
  if (!key || !from) return null;
  return async (email) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
  };
}

/** Sends whatever applies; logs failures without PII. */
export async function sendBookingEmails(
  opts: { base: string; business: Business; booking: Booking; customerEmail?: string; price?: string },
  send: Sender | null = resendSender(),
) {
  if (!send) return;
  const jobs: Promise<void>[] = [];
  if (opts.customerEmail) jobs.push(send(customerEmail(opts.base, opts.business, opts.booking, opts.customerEmail, opts.price)));
  if (opts.business.notifyEmail) jobs.push(send(ownerEmail(opts.base, opts.business, opts.booking)));
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(JSON.stringify({ evt: "email_error", tenant: opts.business.slug, message: String(r.reason) }));
    }
  }
}

export { formatPrice };
