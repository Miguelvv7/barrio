import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash, first } from "@/components/Flash";
import { McpUrl } from "@/components/McpUrl";
import { canEdit } from "@/lib/auth";
import { getBaseUrl, mcpUrl } from "@/lib/base-url";
import { EU_ALLERGENS } from "@/lib/forms";
import { getStore } from "@/lib/store";
import { formatPrice } from "@/lib/text";
import { addDays, nowInZone, WEEKDAY_NAMES_EN, weekdayOf } from "@/lib/time";
import type { Booking, Business, MenuItem, Service, Weekday } from "@/lib/types";
import {
  addBookingAction,
  cancelBookingAction,
  deleteMenuItemAction,
  deleteServiceAction,
  saveHoursAction,
  saveMenuItemAction,
  saveServiceAction,
  saveSettingsAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/dashboard/[slug]">) {
  const business = await getStore().getBusinessBySlug((await params).slug);
  return { title: business?.name ?? "Not found" };
}

const TOOLS: Record<Business["kind"], [string, string][]> = {
  salon: [
    ["get_business_info", "address, phone, hours, today's date"],
    ["get_services", "services, durations and prices"],
    ["check_availability", "free times for a day"],
    ["create_booking", "books after the customer confirms"],
    ["cancel_booking", "reference + phone"],
  ],
  restaurant: [
    ["get_business_info", "address, phone, hours, today's date"],
    ["get_menu", "the menu, searchable"],
    ["check_dish", "price, gluten-free, allergens (never guessed)"],
    ["check_availability", "free tables for a day and party size"],
    ["create_booking", "books after the customer confirms"],
    ["cancel_booking", "reference + phone"],
  ],
};

function Section({ id, title, kicker, children }: { id: string; title: string; kicker: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t-[1.5px] border-ink pt-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">{kicker}</p>
      <h2 className="mt-1 font-display text-3xl font-medium tracking-tight">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Hidden({ slug, id }: { slug: string; id?: string }) {
  return (
    <>
      <input type="hidden" name="slug" value={slug} />
      {id && <input type="hidden" name="id" value={id} />}
    </>
  );
}

function niceDate(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return `${WEEKDAY_NAMES_EN[weekdayOf(date)]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function Agenda({ business, bookings, today, editable, services }: { business: Business; bookings: Booking[]; today: string; editable: boolean; services: Service[] }) {
  const days = new Map<string, Booking[]>();
  for (const b of bookings) days.set(b.date, [...(days.get(b.date) ?? []), b]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-5">
        {days.size === 0 && (
          <p className="rounded-md border-[1.5px] border-dashed border-line p-6 text-center text-ink-soft">
            No upcoming bookings yet. They appear here as soon as a customer books through Alexa+.
          </p>
        )}
        {[...days.entries()].map(([date, list]) => (
          <div key={date}>
            <h3 className="mb-2 font-display text-xl">{niceDate(date, today)}</h3>
            <ul className="divide-y divide-line rounded-md border-[1.5px] border-line bg-paper">
              {list.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <span className="w-14 font-mono text-lg font-semibold tabular-nums">{b.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{b.customerName}</span>
                    <span className="text-ink-soft"> · {business.kind === "restaurant" ? `table for ${b.partySize}` : b.serviceName}</span>
                    {b.notes && <span className="block truncate text-sm text-ink-soft">“{b.notes}”</span>}
                  </span>
                  <span className="font-mono text-xs text-ink-soft" title="Booking reference">
                    {b.reference}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${b.source === "mcp" ? "bg-azulejo-soft text-azulejo" : "bg-cal-2 text-ink-soft"}`}
                  >
                    {b.source === "mcp" ? "via Alexa+" : "manual"}
                  </span>
                  {editable && (
                    <form action={cancelBookingAction}>
                      <Hidden slug={business.slug} id={b.id} />
                      <button className="text-sm font-semibold text-danger hover:underline">Cancel</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {editable && (
        <form action={addBookingAction} className="rotulo grid h-fit gap-3 p-4">
          <Hidden slug={business.slug} />
          <h3 className="font-semibold">Add a phone or walk-in booking</h3>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" name="date" required min={today} defaultValue={today} className="field" aria-label="Date" />
            <input type="time" name="time" required step={business.slotStepMinutes * 60} className="field" aria-label="Time" />
          </div>
          {business.kind === "salon" ? (
            <select name="service" required className="field" aria-label="Service">
              {services.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <input type="number" name="party_size" min={1} max={business.maxPartySize} defaultValue={2} className="field" aria-label="Party size" />
          )}
          <input name="customer_name" required maxLength={80} placeholder="Customer name" className="field" />
          <input name="customer_phone" required maxLength={30} placeholder="Phone" className="field" inputMode="tel" />
          <input name="notes" maxLength={300} placeholder="Note (optional)" className="field" />
          <button className="btn btn-primary">Add booking</button>
        </form>
      )}
    </div>
  );
}

function ServiceForm({ slug, s }: { slug: string; s?: Service }) {
  return (
    <form action={saveServiceAction} className="grid gap-3 sm:grid-cols-[2fr_90px_100px_auto] sm:items-end">
      <Hidden slug={slug} id={s?.id} />
      <label className="grid gap-1 text-xs font-semibold text-ink-soft">
        Name
        <input name="name" required maxLength={120} defaultValue={s?.name} className="field" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-ink-soft">
        Minutes
        <input type="number" name="durationMinutes" required min={5} max={600} step={5} defaultValue={s?.durationMinutes ?? 30} className="field" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-ink-soft">
        Price €
        <input type="number" name="price" required min={0} max={10000} step="0.01" defaultValue={s?.price ?? ""} className="field" />
      </label>
      <button className="btn">{s ? "Save" : "Add"}</button>
      <label className="grid gap-1 text-xs font-semibold text-ink-soft sm:col-span-2">
        Description
        <input name="description" maxLength={300} defaultValue={s?.description} className="field" />
      </label>
      <div className="flex items-center gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="priceFrom" defaultChecked={s?.priceFrom} /> “from” price
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="active" defaultChecked={s?.active ?? true} /> Bookable
        </label>
      </div>
    </form>
  );
}

function Services({ business, services, editable }: { business: Business; services: Service[]; editable: boolean }) {
  return (
    <div className="grid gap-3">
      {services.map((s) => (
        <details key={s.id} className="group rounded-md border-[1.5px] border-line bg-paper open:border-ink">
          <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3">
            <span className="flex-1 font-semibold">
              {s.name} {!s.active && <span className="ml-2 text-xs font-normal text-ink-soft">(hidden)</span>}
            </span>
            <span className="font-mono text-sm text-ink-soft">{s.durationMinutes} min</span>
            <span className="w-24 text-right font-mono">{formatPrice(s.price, business.currency, s.priceFrom)}</span>
            {editable && <span className="text-sm text-azulejo group-open:hidden">Edit</span>}
          </summary>
          {editable && (
            <div className="grid gap-3 border-t border-line px-4 py-4">
              <ServiceForm slug={business.slug} s={s} />
              <form action={deleteServiceAction}>
                <Hidden slug={business.slug} id={s.id} />
                <button className="text-sm font-semibold text-danger hover:underline">Delete service</button>
              </form>
            </div>
          )}
        </details>
      ))}
      {editable && (
        <div className="rotulo p-4">
          <h3 className="mb-3 font-semibold">Add a service</h3>
          <ServiceForm slug={business.slug} />
        </div>
      )}
    </div>
  );
}

function MenuForm({ slug, m }: { slug: string; m?: MenuItem }) {
  return (
    <form action={saveMenuItemAction} className="grid gap-3 sm:grid-cols-[1fr_2fr_100px] sm:items-end">
      <Hidden slug={slug} id={m?.id} />
      <label className="grid gap-1 text-xs font-semibold text-ink-soft">
        Category
        <input name="category" maxLength={60} defaultValue={m?.category} className="field" placeholder="Starters" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-ink-soft">
        Dish
        <input name="name" required maxLength={120} defaultValue={m?.name} className="field" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-ink-soft">
        Price €
        <input type="number" name="price" required min={0} max={10000} step="0.01" defaultValue={m?.price ?? ""} className="field" />
      </label>
      <label className="grid gap-1 text-xs font-semibold text-ink-soft sm:col-span-3">
        Description
        <input name="description" maxLength={400} defaultValue={m?.description} className="field" />
      </label>
      <div className="grid gap-2 text-sm sm:col-span-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5">
            Gluten-free:
            <select name="glutenFree" defaultValue={m?.glutenFree ? "yes" : "unknown"} className="field !w-auto !py-1">
              <option value="unknown">Not stated</option>
              <option value="yes">Yes, gluten-free</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="available" defaultChecked={m?.available ?? true} /> On the menu today
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="allergensDeclared" defaultChecked={m?.allergensDeclared} /> I declare this dish’s allergens:
          </label>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {EU_ALLERGENS.map((a) => (
            <label key={a} className="flex items-center gap-1">
              <input type="checkbox" name="allergens" value={a} defaultChecked={m?.allergens.includes(a)} /> {a}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-soft">
          If you don’t declare allergens, the assistant tells customers to ask your staff. It never guesses.
        </p>
      </div>
      <button className="btn justify-self-start">{m ? "Save dish" : "Add dish"}</button>
    </form>
  );
}

function Menu({ business, menu, editable }: { business: Business; menu: MenuItem[]; editable: boolean }) {
  const cats = new Map<string, MenuItem[]>();
  for (const m of menu) cats.set(m.category || "Other", [...(cats.get(m.category || "Other") ?? []), m]);
  return (
    <div className="grid gap-6">
      {[...cats.entries()].map(([cat, items]) => (
        <div key={cat}>
          <h3 className="mb-2 font-display text-xl">{cat}</h3>
          <div className="grid gap-2">
            {items.map((m) => (
              <details key={m.id} className="group rounded-md border-[1.5px] border-line bg-paper open:border-ink">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{m.name}</span>
                    {!m.available && <span className="ml-2 text-xs text-ink-soft">(off today)</span>}
                    <span className="block truncate text-sm text-ink-soft">{m.description}</span>
                  </span>
                  {m.glutenFree && (
                    <span className="rounded-full bg-olivo/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-olivo">GF</span>
                  )}
                  <span className="w-20 text-right font-mono">{formatPrice(m.price, business.currency)}</span>
                </summary>
                {editable && (
                  <div className="grid gap-3 border-t border-line px-4 py-4">
                    <MenuForm slug={business.slug} m={m} />
                    <form action={deleteMenuItemAction}>
                      <Hidden slug={business.slug} id={m.id} />
                      <button className="text-sm font-semibold text-danger hover:underline">Delete dish</button>
                    </form>
                  </div>
                )}
              </details>
            ))}
          </div>
        </div>
      ))}
      {editable && (
        <div className="rotulo p-4">
          <h3 className="mb-3 font-semibold">Add a dish</h3>
          <MenuForm slug={business.slug} />
        </div>
      )}
    </div>
  );
}

function Hours({ business, editable }: { business: Business; editable: boolean }) {
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  return (
    <form action={saveHoursAction} className="grid gap-2">
      <Hidden slug={business.slug} />
      <fieldset disabled={!editable} className="grid gap-2">
        {order.map((wd) => {
          const shifts = business.hours.filter((h) => h.weekday === wd).sort((a, b) => a.opens.localeCompare(b.opens));
          return (
            <div key={wd} className="grid grid-cols-[90px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr_1fr]">
              <span className="font-semibold">{WEEKDAY_NAMES_EN[wd]}</span>
              {[0, 1].map((i) => (
                <div key={i} className={`flex items-center gap-1.5 ${i === 1 ? "col-start-2 sm:col-start-auto" : ""}`}>
                  <input type="time" name={`d${wd}_open${i + 1}`} defaultValue={shifts[i]?.opens ?? ""} className="field !w-auto" aria-label={`${WEEKDAY_NAMES_EN[wd]} shift ${i + 1} opens`} />
                  <span className="text-ink-soft">–</span>
                  <input type="time" name={`d${wd}_close${i + 1}`} defaultValue={shifts[i]?.closes ?? ""} className="field !w-auto" aria-label={`${WEEKDAY_NAMES_EN[wd]} shift ${i + 1} closes`} />
                </div>
              ))}
            </div>
          );
        })}
      </fieldset>
      <p className="text-xs text-ink-soft">Leave both times empty for a closed shift. Two shifts cover a lunch break.</p>
      {editable && <button className="btn btn-primary justify-self-start">Save hours</button>}
    </form>
  );
}

function Settings({ business, editable }: { business: Business; editable: boolean }) {
  const restaurant = business.kind === "restaurant";
  return (
    <form action={saveSettingsAction} className="grid max-w-3xl gap-4">
      <Hidden slug={business.slug} />
      <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
          Name
          <input name="name" required maxLength={120} defaultValue={business.name} className="field" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
          Description
          <textarea name="description" maxLength={400} rows={2} defaultValue={business.description} className="field" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Phone
          <input name="phone" maxLength={30} defaultValue={business.phone} className="field" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Address
          <input name="address" maxLength={200} defaultValue={business.address} className="field" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          {restaurant ? "Tables available at once" : "Chairs / staff working at once"}
          <input type="number" name="capacity" min={1} max={200} required defaultValue={business.capacity} className="field" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Start times every
          <select name="slotStepMinutes" defaultValue={business.slotStepMinutes} className="field">
            {[5, 10, 15, 20, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        {restaurant && (
          <>
            <label className="grid gap-1.5 text-sm font-semibold">
              Table time (minutes)
              <input type="number" name="tableDurationMinutes" min={30} max={300} required defaultValue={business.tableDurationMinutes} className="field" />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">
              Largest group bookable by voice
              <input type="number" name="maxPartySize" min={1} max={100} required defaultValue={business.maxPartySize} className="field" />
            </label>
          </>
        )}
      </fieldset>
      {editable && <button className="btn btn-primary justify-self-start">Save settings</button>}
    </form>
  );
}

export default async function BusinessDashboard({ params, searchParams }: PageProps<"/dashboard/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const store = getStore();
  const business = await store.getBusinessBySlug(slug);
  if (!business) notFound();

  const today = nowInZone(business.timezone).date;
  const [editable, base, bookings, services, menu] = await Promise.all([
    canEdit(business.id),
    getBaseUrl(),
    store.listBookings(business.id, { from: today, to: addDays(today, 30) }),
    business.kind === "salon" ? store.listServices(business.id) : Promise.resolve([]),
    business.kind === "restaurant" ? store.listMenu(business.id) : Promise.resolve([]),
  ]);
  const url = mcpUrl(base, business.slug);
  const todayCount = bookings.filter((b) => b.date === today).length;
  const viaAlexa = bookings.filter((b) => b.source === "mcp").length;

  return (
    <div className="grid gap-12">
      <div>
        <Flash msg={first(sp.msg)} err={first(sp.err)} />
        {!editable && (
          <div className="mb-6 rounded-md border-[1.5px] border-albero/60 bg-albero/10 px-4 py-3 text-sm">
            <strong>Read-only demo view.</strong> You can look around; only the owner can change things.{" "}
            <Link href={`/login?next=/dashboard/${business.slug}`} className="font-semibold underline">
              Owner log in
            </Link>{" "}
            or{" "}
            <Link href="/dashboard/new" className="font-semibold underline">
              create your own business
            </Link>
            .
          </div>
        )}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">
              {business.kind === "salon" ? "Appointments" : "Restaurant"} · {business.address || "No address yet"}
            </p>
            <h1 className="mt-2 font-display text-[clamp(2.4rem,5vw,3.8rem)] font-medium leading-none tracking-tight">{business.name}</h1>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="font-display text-5xl leading-none">{todayCount}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">today</p>
            </div>
            <div>
              <p className="font-display text-5xl leading-none text-azulejo">{viaAlexa}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">booked by voice</p>
            </div>
          </div>
        </div>
      </div>

      <section className="rotulo grid gap-6 p-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="font-display text-2xl font-medium">Your MCP server</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Streamable HTTP · MCP 2025-11-25. Add this URL as a custom connector in Alexa+, Claude, or any MCP client.
          </p>
          <div className="mt-4">
            <McpUrl url={url} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/try/${business.slug}`} className="btn btn-primary">
              Test it by voice →
            </Link>
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">Tools the assistant gets</p>
          <ul className="grid gap-1.5">
            {TOOLS[business.kind].map(([name, what]) => (
              <li key={name} className="flex gap-2 text-sm">
                <code className="font-mono text-[12.5px] text-azulejo">{name}</code>
                <span className="text-ink-soft">— {what}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <nav className="-mb-6 flex flex-wrap gap-2 text-sm" aria-label="Sections">
        {[
          ["agenda", "Agenda"],
          ["catalog", business.kind === "salon" ? "Services" : "Menu"],
          ["hours", "Opening hours"],
          ["settings", "Settings"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="btn btn-ghost !py-1.5">
            {label}
          </a>
        ))}
      </nav>

      <Section id="agenda" kicker="Next 30 days" title="Agenda">
        <Agenda business={business} bookings={bookings} today={today} editable={editable} services={services} />
      </Section>
      <Section id="catalog" kicker="What the assistant can offer" title={business.kind === "salon" ? "Services" : "Menu"}>
        {business.kind === "salon" ? (
          <Services business={business} services={services} editable={editable} />
        ) : (
          <Menu business={business} menu={menu} editable={editable} />
        )}
      </Section>
      <Section id="hours" kicker="Bookable times come from these" title="Opening hours">
        <Hours business={business} editable={editable} />
      </Section>
      <Section id="settings" kicker="Business details" title="Settings">
        <Settings business={business} editable={editable} />
      </Section>
    </div>
  );
}
