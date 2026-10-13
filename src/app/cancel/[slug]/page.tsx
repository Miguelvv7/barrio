import Link from "next/link";
import { notFound } from "next/navigation";
import { Flash, first } from "@/components/Flash";
import { Wordmark } from "@/components/Wordmark";
import { verifyCancelReceipt } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { cancelByCustomerAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cancel a booking", robots: { index: false } };

// Customers of a Spanish shop may prefer Spanish: English by default, Spanish one tap away.
const TEXT = {
  en: {
    title: "Cancel a booking",
    reference: "Booking reference",
    phone: "Phone number used for the booking",
    submit: "Cancel booking",
    done: (ref: string) => `Booking ${ref} is cancelled.`,
    questions: (phone: string) => `Questions? Call ${phone}.`,
    other: "Español",
    nomatch: "We couldn't find an upcoming booking with that reference and phone number.",
    rate: "Too many attempts — please try again in a few minutes.",
  },
  es: {
    title: "Cancelar una reserva",
    reference: "Referencia de la reserva",
    phone: "Teléfono con el que reservaste",
    submit: "Cancelar reserva",
    done: (ref: string) => `La reserva ${ref} está cancelada.`,
    questions: (phone: string) => `¿Dudas? Llama al ${phone}.`,
    other: "English",
    nomatch: "No hay ninguna reserva próxima con esa referencia y ese teléfono.",
    rate: "Demasiados intentos. Prueba de nuevo en unos minutos.",
  },
};

export default async function CancelPage({ params, searchParams }: PageProps<"/cancel/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const business = await getStore().getBusinessBySlug(slug);
  if (!business) notFound();
  const lang = first(sp.lang) === "es" ? "es" : "en";
  const t = TEXT[lang];
  const doneRef = first(sp.done);
  // Only trust "cancelled" when this server signed it — a hand-made ?done= link shows the form.
  const done = doneRef && verifyCancelReceipt(business.slug, doneRef, first(sp.r)) ? doneRef : undefined;
  const err = first(sp.err);
  const ref = first(sp.ref) ?? "";
  const switchHref = `/cancel/${business.slug}?${new URLSearchParams({ ...(ref ? { ref } : {}), ...(lang === "en" ? { lang: "es" } : {}) })}`;
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between">
          <Wordmark />
          <Link href={switchHref} className="text-sm font-semibold text-ink-soft hover:text-ink" hrefLang={lang === "en" ? "es" : "en"}>
            {t.other}
          </Link>
        </div>
        <div className="rotulo mt-8 p-6" lang={lang}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">{business.name}</p>
          <h1 className="mt-1 font-display text-3xl font-medium">{t.title}</h1>
          <div className="mt-4">
            <Flash msg={done ? t.done(done) : undefined} err={err ? (err === "rate" ? t.rate : t.nomatch) : undefined} />
          </div>
          {!done && (
            <form action={cancelByCustomerAction} className="grid gap-4">
              <input type="hidden" name="slug" value={business.slug} />
              <input type="hidden" name="lang" value={lang} />
              <label className="grid gap-1.5 text-sm font-semibold">
                {t.reference}
                <input name="reference" required maxLength={12} defaultValue={ref} className="field font-mono uppercase tracking-widest" autoComplete="off" />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">
                {t.phone}
                <input name="phone" required maxLength={30} inputMode="tel" autoComplete="tel" className="field" />
              </label>
              <button className="btn btn-primary justify-self-start">{t.submit}</button>
            </form>
          )}
          <p className="mt-6 text-sm text-ink-soft">{t.questions(business.phone)}</p>
        </div>
      </div>
    </main>
  );
}
