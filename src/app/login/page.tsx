import { Wordmark } from "@/components/Wordmark";
import { Flash, first } from "@/components/Flash";
import { loginAction } from "./actions";

export const metadata = { title: "Owner log in" };

export default async function Login({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm">
        <Wordmark />
        <form action={loginAction} className="rotulo mt-8 grid gap-4 p-6">
          <h1 className="font-display text-3xl font-medium">Owner log in</h1>
          <Flash
            err={
              first(sp.err) === "2"
                ? "Too many wrong passwords. Try again in 15 minutes."
                : first(sp.err)
                  ? "Wrong password."
                  : undefined
            }
          />
          <input type="hidden" name="next" value={first(sp.next) ?? "/dashboard"} />
          <label className="grid gap-1.5 text-sm font-semibold">
            Password
            <input type="password" name="password" required autoFocus className="field" autoComplete="current-password" />
          </label>
          <button className="btn btn-primary">Log in</button>
        </form>
      </div>
    </main>
  );
}
