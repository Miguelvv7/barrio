/** Phone numbers arrive spoken ("six seven four…"), formatted ("+34 674 88 75 00") or bare. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

/** Two numbers match if their last 9 digits match (Spanish numbers are 9 digits; ignores +34 / 0034). */
export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na.length < 6 || nb.length < 6) return false;
  return na.slice(-9) === nb.slice(-9);
}

export function isPlausiblePhone(input: string): boolean {
  const digits = normalizePhone(input);
  return digits.length >= 6 && digits.length <= 15;
}
