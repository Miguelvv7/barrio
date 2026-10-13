/**
 * Two kinds of editor:
 *  - Admin: knows BARRIO_ADMIN_PASSWORD. Can edit every business.
 *  - Owner: created a business from this browser. Can edit that business only
 *    (an HMAC-signed cookie lists the business IDs they created).
 * Everyone else gets a read-only dashboard — so hackathon judges can look around without being
 * able to wreck the demo tenants. With no BARRIO_ADMIN_PASSWORD set, everyone is admin in local dev
 * (`next dev`) and nobody is in production.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "barrio_admin";
export const OWNER_COOKIE = "barrio_owner";
const MAX_OWNED = 10;

const globalSecret = globalThis as unknown as { __barrioSecret?: string };

function secret(): string {
  const configured = process.env.BARRIO_SECRET || process.env.BARRIO_ADMIN_PASSWORD;
  if (configured) return configured;
  globalSecret.__barrioSecret ??= randomBytes(32).toString("hex");
  return globalSecret.__barrioSecret;
}

/** Secret for long-lived owner links (calendar feed). Stable across deploys when BARRIO_SECRET is set. */
export function calendarSecret(): string {
  return `${secret()}:calendar`;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function authEnabled(): boolean {
  return Boolean(process.env.BARRIO_ADMIN_PASSWORD);
}

/** Bound to the current password: changing BARRIO_ADMIN_PASSWORD logs every admin out. */
export function adminToken(): string {
  return sign(`admin:${process.env.BARRIO_ADMIN_PASSWORD ?? ""}`);
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.BARRIO_ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  // Compare HMACs so the comparison is constant-time regardless of length.
  return safeEqual(sign(`pw:${candidate}`), sign(`pw:${expected}`));
}

export async function isAdmin(): Promise<boolean> {
  // Fail closed: a production deploy without a password has no admin at all (read-only + own sandboxes).
  if (!authEnabled()) return process.env.NODE_ENV !== "production";
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  return Boolean(value) && safeEqual(value!, adminToken());
}

export async function ownedBusinessIds(): Promise<string[]> {
  const raw = (await cookies()).get(OWNER_COOKIE)?.value;
  if (!raw) return [];
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return [];
  const payload = raw.slice(0, dot);
  if (!safeEqual(raw.slice(dot + 1), sign(`owner:${payload}`))) return [];
  return payload.split(",").filter(Boolean);
}

export async function addOwnedBusiness(id: string) {
  const ids = [id, ...(await ownedBusinessIds()).filter((x) => x !== id)].slice(0, MAX_OWNED);
  const payload = ids.join(",");
  (await cookies()).set(OWNER_COOKIE, `${payload}.${sign(`owner:${payload}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

const PAGE_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

/** Short-lived token the /try page embeds so only our own page can call the paid assistant endpoint. */
export function issuePageToken(slug: string, now = Date.now()): string {
  const exp = now + PAGE_TOKEN_TTL_MS;
  return `${exp}.${sign(`try:${slug}:${exp}`)}`;
}

export function verifyPageToken(slug: string, token: string | null, now = Date.now()): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now || exp > now + PAGE_TOKEN_TTL_MS || !sig) return false;
  return safeEqual(sig, sign(`try:${slug}:${exp}`));
}

export async function canEdit(businessId: string): Promise<boolean> {
  if (await isAdmin()) return true;
  return (await ownedBusinessIds()).includes(businessId);
}
