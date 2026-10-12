/**
 * Two kinds of editor:
 *  - Admin: knows BARRIO_ADMIN_PASSWORD. Can edit every business.
 *  - Owner: created a business from this browser. Can edit that business only
 *    (an HMAC-signed cookie lists the business IDs they created).
 * Everyone else gets a read-only dashboard — so hackathon judges can look around without being
 * able to wreck the demo tenants. With no BARRIO_ADMIN_PASSWORD set (local dev), everyone is admin.
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

export function adminToken(): string {
  return sign("admin");
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.BARRIO_ADMIN_PASSWORD ?? "";
  if (!expected) return false;
  // Compare HMACs so the comparison is constant-time regardless of length.
  return safeEqual(sign(`pw:${candidate}`), sign(`pw:${expected}`));
}

export async function isAdmin(): Promise<boolean> {
  if (!authEnabled()) return true;
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

export async function canEdit(businessId: string): Promise<boolean> {
  if (await isAdmin()) return true;
  return (await ownedBusinessIds()).includes(businessId);
}
