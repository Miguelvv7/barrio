import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { authEnabled, isAdmin } from "@/lib/auth";
import { logoutAction } from "../login/actions";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const admin = await isAdmin();
  const auth = authEnabled();
  return (
    <div className="min-h-dvh">
      <header className="border-b-[1.5px] border-ink bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Wordmark />
            <span className="hidden text-sm text-ink-soft sm:inline">/</span>
            <Link href="/dashboard" className="hidden text-sm font-semibold sm:inline">
              Owner dashboard
            </Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {auth && admin && (
              <form action={logoutAction}>
                <button className="btn btn-ghost">Log out</button>
              </form>
            )}
            {auth && !admin && (
              <Link href="/login?next=/dashboard" className="btn btn-ghost">
                Owner log in
              </Link>
            )}
            <Link href="/dashboard/new" className="btn btn-primary">
              + New business
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">{children}</main>
    </div>
  );
}
