import { Flash, first } from "@/components/Flash";
import { createBusinessAction } from "../actions";

export const metadata = { title: "New business" };

export default async function NewBusiness({ searchParams }: PageProps<"/dashboard/new">) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">Step 1 of 2</p>
      <h1 className="mt-2 font-display text-5xl font-medium tracking-tight">Put your business on Alexa+</h1>
      <p className="mt-3 text-ink-soft">Tell us the basics. Services, menu and hours come next.</p>
      <div className="mt-8">
        <Flash err={first(sp.err)} />
      </div>
      <form action={createBusinessAction} className="rotulo grid gap-5 p-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">What kind of business?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { v: "salon", t: "Appointments", d: "Barber, hair salon, beauty, physio…" },
              { v: "restaurant", t: "Restaurant", d: "Menu questions and table bookings" },
            ].map((o, i) => (
              <label
                key={o.v}
                className="flex cursor-pointer gap-3 rounded-md border-[1.5px] border-line p-3 has-[:checked]:border-terracota has-[:checked]:bg-terracota/5"
              >
                <input type="radio" name="kind" value={o.v} defaultChecked={i === 0} className="mt-1 accent-[var(--terracota)]" />
                <span>
                  <span className="block font-semibold">{o.t}</span>
                  <span className="text-sm text-ink-soft">{o.d}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1.5 text-sm font-semibold">
          Business name
          <input name="name" required maxLength={120} className="field" placeholder="Bar Manolo" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Short description <span className="font-normal text-ink-soft">— the assistant uses it to introduce you</span>
          <textarea name="description" maxLength={400} rows={2} className="field" placeholder="Tapas bar in the old town, known for salmorejo." />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold">
            Phone
            <input name="phone" maxLength={30} className="field" placeholder="+34 600 000 000" />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Web address <span className="font-normal text-ink-soft">(optional)</span>
            <input name="slug" maxLength={48} className="field font-mono" placeholder="bar-manolo" pattern="[a-zA-Z0-9\- ]*" />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-semibold">
          Address
          <input name="address" maxLength={200} className="field" placeholder="Calle Mayor 1, Écija" />
        </label>
        <button className="btn btn-primary justify-self-start !px-6 !py-2.5">Create my MCP server →</button>
      </form>
    </div>
  );
}
