"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken, checkPassword } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";

export async function loginAction(form: FormData) {
  const next = safeNext(form.get("next"));
  // Small fixed delay: makes online password guessing slow without needing a rate-limit store.
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPassword(String(form.get("password") ?? ""))) {
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
