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
  if (q.length >= 3 && (n.includes(q) || q.includes(n))) return 0.9;
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

/** Ranks items by their best-matching name; `name` may return several (official name + aliases). */
export function rank<T>(query: string, items: T[], name: (item: T) => string | string[]): Ranked<T>[] {
  return items
    .map((item) => {
      const names = name(item);
      const score = Math.max(0, ...(Array.isArray(names) ? names : [names]).map((n) => matchScore(query, n)));
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Other items that account for words of the query the best match leaves out. "tacos with
 * guacamole": the best name is "Guacamole" (contained in the query), but "tacos" points at the
 * tacos — answering about the guacamole would be answering the wrong question. Non-empty means
 * ask the customer which one. Filler words ("please", "your") match nothing and don't count.
 */
export function conflictingMatches<T>(query: string, ranked: Ranked<T>[], name: (item: T) => string | string[]): T[] {
  const [best, ...rest] = ranked;
  if (!best) return [];
  const namesOf = (item: T) => {
    const n = name(item);
    return Array.isArray(n) ? n : [n];
  };
  const qt = tokens(query);
  const left = (n: string) => {
    const nt = tokens(n);
    return qt.filter((t) => !nt.some((w) => w === t || similar(w, t)));
  };
  // The best item's name (or alias) that explains the most of what was said; ties → closest match.
  const uncovered = namesOf(best.item)
    .map((n) => ({ left: left(n), score: matchScore(query, n) }))
    .sort((a, b) => a.left.length - b.left.length || b.score - a.score)[0].left;
  if (uncovered.length === 0) return [];
  return rest
    .filter((r) => namesOf(r.item).some((n) => tokens(n).some((w) => uncovered.some((u) => w === u || similar(w, u)))))
    .map((r) => r.item);
}

/** "gluten free", "sin gluten", "celiac"… in a menu question means: only dishes listed as gluten-free. */
const GLUTEN_FREE_WORDS = /\b(gluten free|free of gluten|without gluten|no gluten|sin gluten|celiac|celiacs|coeliac|coeliacs|celiaco|celiacos|celiaca|gf)\b/;
export function wantsGlutenFree(query: string): { glutenFree: boolean; rest: string } {
  const q = fold(query);
  if (!GLUTEN_FREE_WORDS.test(q)) return { glutenFree: false, rest: query };
  const rest = q
    .replace(new RegExp(GLUTEN_FREE_WORDS.source, "g"), " ")
    .replace(/\b(options?|dishes|dish|food|anything|something|what|which|is|are|there|have|you|do|for|platos?|opciones|algo|que|hay|tienes|teneis|para)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { glutenFree: true, rest };
}

export function formatPrice(amount: number, currency: string, from = false): string {
  const formatted = new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
  return from ? `from ${formatted}` : formatted;
}
