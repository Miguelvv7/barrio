import { Wordmark } from "@/components/Wordmark";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
      <Wordmark />
      <h1 className="mt-10 font-display text-5xl font-medium tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">Last updated {updated}</p>
      <div className="mt-8 grid gap-5 leading-relaxed [&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_a]:font-semibold [&_a]:underline">
        {children}
      </div>
    </main>
  );
}

export function contactLine() {
  const email = process.env.BARRIO_CONTACT_EMAIL;
  const repo = process.env.BARRIO_REPO_URL ?? "https://github.com/Miguelvv7/barrio";
  return { email, repo };
}
