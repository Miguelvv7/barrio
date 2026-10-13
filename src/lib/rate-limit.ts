/**
 * Best-effort sliding-window limiter, per server instance. It won't stop a determined attacker
 * across many serverless instances, but it caps casual abuse of the paid LLM endpoint.
 */
const buckets = new Map<string, number[]>();

/** Records a hit and says whether it's within the limit. With `peek`, only checks (records nothing). */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now(), opts: { peek?: boolean } = {}): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  if (opts.peek) return true;
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return true;
}
