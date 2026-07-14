import { ValueTransformer } from 'typeorm';

/**
 * TypeORM transformer for `bigint` "minor unit" money columns (price_minor,
 * compare_at_minor, cost_minor, ...). Postgres
 * `bigint` comes back from node-postgres as a *string* (it won't silently
 * hand back a value that could lose precision as a JS number), so without
 * this transformer every entity would type these columns as `string` and
 * every consumer would have to remember to parse them.
 *
 * Values stay well within JS's safe integer range for any realistic amount
 * of money (Number.MAX_SAFE_INTEGER minor units ≈ $90 trillion), so a plain
 * `number` is fine on the application side — no BigInt/string arithmetic
 * needed in services or DTOs.
 *
 * Usage: `@Column({ type: 'bigint', name: 'price_minor', nullable: true, transformer: MoneyTransformer })`
 */
export const MoneyTransformer: ValueTransformer = {
  to: (value?: number | null): string | null =>
    value === undefined || value === null ? null : String(Math.trunc(value)),
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};

/** Convert a decimal amount (e.g. 19.99) to integer minor units (1999). */
export function toMinorUnits(amount: number, decimals = 2): number {
  return Math.round(amount * 10 ** decimals);
}

/** Convert integer minor units (1999) back to a decimal amount (19.99). */
export function fromMinorUnits(minor: number, decimals = 2): number {
  return minor / 10 ** decimals;
}

/** Format minor units as a localized currency string, e.g. 1999 -> "$19.99". */
export function formatMoney(
  minor: number | null | undefined,
  currency = 'USD',
  locale = 'en-US',
): string {
  if (minor === null || minor === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(fromMinorUnits(minor));
}
