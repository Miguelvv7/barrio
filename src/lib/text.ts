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

/**
 * Scores how well a spoken query matches a name. 1 = exact, 0 = nothing in common.
 * Good enough for "corte y barba" vs "Corte y Barba", "burger kansas" vs "Burguer Kansas".
 */
export function matchScore(query: string, name: string): number {
  const q = fold(query);
  if (!q || !fold(name)) return 0;
  if (q === fold(name)) return 1;
  const qt = polar(query);
  const nt = polar(name);
  if (qt.length === 0 || nt.length === 0) return 0;
  // "Without beard": a name that has what the customer doesn't want is out.
  const unwanted = qt.filter((w) => w.startsWith("!")).flatMap((w) => formsOf(w.slice(1)));
  if (unwanted.some((f) => nt.includes(f))) return 0;
  // What a name says it is NOT only matches the same "not": "barba" isn't "Corte y Peinado (sin
  // barba)", "corte sin barba" is.
  const n = positive(name);
  if (!unwanted.length && q.length >= 3 && n && (n.includes(q) || q.includes(n))) return 0.9;
  // "burgers" finds "Burguer Montana" and the "Hamburguesas" category alike. Typos are forgiven in
  // the customer's own word; translations only stretch to a plural ("patatas" → fries, not "fried").
  const close = (w: string, f: string, own: boolean) =>
    !w.startsWith("!") && !f.startsWith("!") && (own ? similar(w, f) : w === `${f}s` || f === `${w}s`);
  const hits = qt.filter((t) => formsOf(t).some((f, k) => nt.some((w) => w === f || close(w, f, k === 0)))).length;
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

/** English words customers use for the Spanish names on a menu or price list. */
const SYNONYMS: Record<string, string[]> = {
  burger: ["hamburguesa", "burguer"],
  burgers: ["hamburguesas", "burguer"],
  hamburger: ["hamburguesa"],
  salad: ["ensalada"],
  salads: ["ensaladas"],
  starter: ["entrante"],
  starters: ["entrantes"],
  appetizer: ["entrante"],
  dessert: ["postre"],
  desserts: ["postres"],
  drink: ["bebida"],
  drinks: ["bebidas"],
  chicken: ["pollo"],
  beef: ["ternera"],
  cheese: ["queso"],
  fries: ["patatas"],
  wings: ["alitas", "alas"],
  ribs: ["costillas"],
  bacon: ["beicon"],
  vegetarian: ["vegetariana", "vegetariano"],
  veggie: ["vegetariana", "vegetariano"],
  soda: ["refresco"],
  sodas: ["refrescos"],
  shave: ["afeitado"],
  haircut: ["corte"],
  beard: ["barba"],
  design: ["dibujo"],
};
const NEGATIONS = new Set(["no", "sin", "without", "not"]);

/**
 * A word and the words that mean the same, both ways: "burger" finds "hamburguesa", and
 * "hamburguesa" finds "Burguer Kansas". Own keys only, so "constructor" is just a word.
 */
const FORMS = new Map<string, Set<string>>();
for (const [en, es] of Object.entries(SYNONYMS)) {
  for (const word of [en, ...es]) {
    const forms = FORMS.get(word) ?? new Set<string>();
    for (const other of [en, ...es]) if (other !== word) forms.add(other);
    FORMS.set(word, forms);
  }
}
function formsOf(t: string): string[] {
  if (t.startsWith("!")) return formsOf(t.slice(1)).map((f) => `!${f}`);
  return [t, ...(FORMS.get(t) ?? [])];
}

/** The text without what it says it is NOT: "Corte y Peinado (sin barba)" → "corte y peinado". */
function positive(text: string): string {
  const words = fold(text).split(" ");
  return words.filter((t, i) => !NEGATIONS.has(t) && !NEGATIONS.has(words[i - 1] ?? "")).join(" ");
}

/** Tokens with negated words marked: "Corte y Peinado (sin barba)" → corte, peinado, !barba. */
function polar(text: string): string[] {
  const words = fold(text).split(" ");
  return words
    .map((t, i) => (NEGATIONS.has(t) ? "" : NEGATIONS.has(words[i - 1] ?? "") ? `!${t}` : t))
    .filter((t) => t.replace("!", "").length > 1 && !STOPWORDS.has(t));
}

/**
 * Words that matter for matching: no stopwords, and nothing negated — "without design" in a query,
 * or "(sin barba)" in a service name, says what it is NOT.
 */
function meaningful(text: string): string[] {
  const words = fold(text).split(" ");
  return words.filter((t, i) => t.length > 1 && !STOPWORDS.has(t) && !NEGATIONS.has(t) && !NEGATIONS.has(words[i - 1] ?? ""));
}

function covers(words: string[], t: string): boolean {
  const forms = formsOf(t);
  return words.some((w) => forms.some((f) => w === f || similar(w, f)));
}

/**
 * Other items that account for words of the query the best match leaves out. "tacos with
 * guacamole": the best name is "Guacamole" (contained in the query), but "tacos" points at the
 * tacos — answering about the guacamole would be answering the wrong question. Non-empty means
 * ask the customer which one. Words the best item explains anyway (its category or description,
 * "chimichanga taco", "guacamole with nachos"), filler ("please") and negated words ("without
 * design") don't count.
 */
export function conflictingMatches<T>(
  query: string,
  ranked: Ranked<T>[],
  name: (item: T) => string | string[],
  context: (item: T) => string = () => "",
): T[] {
  const [best, ...rest] = ranked;
  if (!best) return [];
  const namesOf = (item: T) => {
    const n = name(item);
    return Array.isArray(n) ? n : [n];
  };
  const qt = meaningful(query);
  const extra = meaningful(context(best.item));
  const left = (n: string) => {
    const known = [...meaningful(n), ...extra];
    return qt.filter((t) => !covers(known, t));
  };
  // The best item's name (or alias) that explains the most of what was said; ties → closest match.
  const uncovered = namesOf(best.item)
    .map((n) => ({ left: left(n), score: matchScore(query, n) }))
    .sort((a, b) => a.left.length - b.left.length || b.score - a.score)[0].left;
  if (uncovered.length === 0) return [];
  return rest.filter((r) => namesOf(r.item).some((n) => uncovered.some((u) => covers(meaningful(n), u)))).map((r) => r.item);
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

/** "José García" → "J. G." for the public demo dashboard: letters only, so emoji and stray marks never show half a character. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .map((w) => w.match(/\p{L}/u)?.[0])
    .filter((c): c is string => Boolean(c));
  return letters.slice(0, 3).map((c) => `${c.toUpperCase()}.`).join(" ") || "—";
}
