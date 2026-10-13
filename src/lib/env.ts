/**
 * Misconfiguration that would only show up later (lost bookings, forgeable links) fails loudly on
 * the real deployment instead. Only Vercel production: local `next start` and CI keep working
 * with zero config.
 */
export function isVercelProduction(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
