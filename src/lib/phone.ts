/** Phone numbers arrive spoken ("six seven four…"), formatted ("+34 674 88 75 00") or bare. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Two numbers match if their last 9 digits match (Spanish numbers are 9 digits; ignores +34 /
 * 0034) — or their last 10 when both have at least 10, so US numbers that differ only in the
 * area code (+1 212 555 0100 vs +1 312 555 0100) aren't the same customer.
 */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na.length < 6 || nb.length < 6) return false;
  const n = na.length >= 10 && nb.length >= 10 ? 10 : 9;
  return na.slice(-n) === nb.slice(-n);
}

export function isPlausiblePhone(input: string): boolean {
  const digits = normalizePhone(input);
  return digits.length >= 6 && digits.length <= 15;
}
