import { after, type NextRequest } from "next/server";
import { handleMcpRequest } from "@/lib/mcp/handler";
import { sendBookingEmails } from "@/lib/notify";
import { getStore } from "@/lib/store";
import { formatPrice } from "@/lib/text";

// Node runtime: the in-memory store and crypto need it; MCP requests are short-lived.
export const runtime = "nodejs";
// Alexa+ calls from the US and expects < 500 ms round trips: run next to the database.
// Put the Supabase project in us-east-1 (N. Virginia) to match Vercel's iad1.
export const preferredRegion = "iad1";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/mcp/[slug]">;

async function handle(request: NextRequest, ctx: Ctx) {
  const { slug } = await ctx.params;
  const base = process.env.BARRIO_PUBLIC_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
  return handleMcpRequest(request, slug, {
    hooks: {
      // Emails go out after the response is sent, so they never count against Alexa+'s latency budget.
      onBooked: ({ business, booking, customerEmail }) =>
        after(async () => {
          let price: string | undefined;
          if (booking.serviceId) {
            const svc = (await getStore().listServices(business.id)).find((s) => s.id === booking.serviceId);
            if (svc) price = formatPrice(svc.price, business.currency, svc.priceFrom);
          }
          await sendBookingEmails({ base, business, booking, customerEmail, price });
        }),
    },
  });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = handle;
