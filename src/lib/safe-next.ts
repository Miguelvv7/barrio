/** Only same-site paths under /dashboard; anything odd (//, backslashes, control chars) → /dashboard. */
export function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "");
  if (!/^\/dashboard(?:[/?#][^\\\s]*)?$/.test(next) || /[\u0000-\u001f\u007f]/.test(next)) return "/dashboard";
  try {
    const url = new URL(next, "https://barrio.invalid");
    return url.origin === "https://barrio.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
