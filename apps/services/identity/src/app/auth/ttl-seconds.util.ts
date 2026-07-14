/**
 * Converts jose's `setExpirationTime` shorthand (used for JWT_ACCESS_TTL /
 * JWT_INTERNAL_TTL, e.g. '5m', '15m', '1h') into whole seconds, for the
 * OAuth2-shaped `expires_in` field in the client-credentials token
 * response. Only supports the small subset of units this repo actually
 * configures (s/m/h/d) — not jose's full grammar (which also accepts things
 * like "2 days", "1.5 hrs", trailing "ago"/"from now").
 */
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
};

export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  if (!match) {
    throw new Error(
      `Unsupported TTL format: "${ttl}" (expected e.g. "5m", "15m", "1h")`,
    );
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_SECONDS[unit];
}
