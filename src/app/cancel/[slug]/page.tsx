import { notFound } from "next/navigation";
import { Flash, first } from "@/components/Flash";
import { Wordmark } from "@/components/Wordmark";
import { getStore } from "@/lib/store";
import { cancelByCustomerAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cancel a booking", robots: { index: false } };

const ERRORS: Record<string, string> = {
  nomatch: "No upcoming booking matches that reference and phone number. / No hay ninguna reserva con esos datos.",
  rate: "Too many attempts — try again in a few minutes. / Demasiados intentos.",
};

export default async function CancelPage({ params, searchParams }: PageProps<"/cancel/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const business = await getStore().getBusinessBySlug(slug);
  if (!business) notFound();
  const done = first(sp.done);
  const err = first(sp.err);
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Wordmark />
        <div className="rotulo mt-8 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">{business.name}</p>
          <h1 className="mt-1 font-display text-3xl font-medium">Cancel a booking · Cancelar</h1>
          <div className="mt-4">
            <Flash
              msg={done ? `Booking ${done} cancelled. / Reserva ${done} cancelada.` : undefined}
              err={err ? (ERRORS[err] ?? ERRORS.nomatch) : undefined}
            />
          </div>
          {!done && (
            <form action={cancelByCustomerAction} className="grid gap-4">
              <input type="hidden" name="slug" value={business.slug} />
              <label className="grid gap-1.5 text-sm font-semibold">
                Reference · Referencia
                <input name="reference" required maxLength={12} defaultValue={first(sp.ref) ?? ""} className="field font-mono uppercase tracking-widest" autoComplete="off" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                Phone you booked with · Teléfono de la reserva
                <input name="phone" required maxLength={30} inputMode="tel" autoComplete="tel" className="field" />
              </label>
              <button className="btn btn-primary justify-self-start">Cancel booking · Cancelar</button>
            </form>
          )}
          <p className="mt-6 text-sm text-ink-soft">
            Questions? Call {business.phone}. · ¿Dudas? Llama al {business.phone}.
          </p>
        </div>
      </div>
    </main>
  );
}
