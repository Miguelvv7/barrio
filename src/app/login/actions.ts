"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, checkPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";

export async function loginAction(form: FormData) {
  const next = safeNext(form.get("next"));
  // Small fixed delay plus a per-IP cap: a delay alone doesn't stop parallel guesses. Only failed
  // attempts count, so the owner logging in is never slowed down by their own visits.
  await new Promise((r) => setTimeout(r, 400));
  const ip = clientIp(await headers());
  if (!rateLimit(`login-check:${ip}`, 10, 15 * 60_000, Date.now(), { peek: true })) {
    redirect(`/login?err=2&next=${encodeURIComponent(next)}`);
  }
  if (!checkPassword(String(form.get("password") ?? ""))) {
    rateLimit(`login-check:${ip}`, 10, 15 * 60_000);
    redirect(`/login?err=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next);
}

export async function logoutAction() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/");
}
