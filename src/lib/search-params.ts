/** First value of a search param (Next gives string | string[] | undefined). */
export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
