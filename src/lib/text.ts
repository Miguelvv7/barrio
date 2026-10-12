/** Accent- and case-insensitive normalisation for matching spoken names ("cesar" → "César"). */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["the", "a", "an", "de", "del", "la", "el", "los", "las", "y", "and", "con", "with", "un", "una"]);

function tokens(value: string): string[] {
  return fold(value)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Scores how well a spoken query matches a name. 1 = exact, 0 = nothing in common.
 * Good enough for "corte y barba" vs "Corte y Barba", "burger kansas" vs "Burguer Kansas".
 */
export function matchScore(query: string, name: string): number {
  const q = fold(query);
  const n = fold(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.includes(q) || q.includes(n)) return 0.9;
  const qt = tokens(query);
  const nt = tokens(name);
  if (qt.length === 0 || nt.length === 0) return 0;
  const hits = qt.filter((t) => nt.some((w) => w === t || similar(w, t))).length;
  if (hits === 0) return 0;
  // Coverage of what the customer said matters most; extra words in the name cost a little.
  const coverage = hits / qt.length;
  const precision = hits / nt.length;
  return 0.85 * (0.7 * coverage + 0.3 * precision);
}

/** Tolerates one typo / spelling variant ("burger" ~ "burguer", "oregon" ~ "oregón"). */
function similar(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

export function rank<T>(query: string, items: T[], name: (item: T) => string): Ranked<T>[] {
  return items
    .map((item) => ({ item, score: matchScore(query, name(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function formatPrice(amount: number, currency: string, from = false): string {
  const formatted = new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
  return from ? `from ${formatted}` : formatted;
}
