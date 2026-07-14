/**
 * Server-side PO totals — never accepted from the client. `taxRate` is a
 * percentage (e.g. `10` for 10%), matching the `tax_rate numeric(5,2)`
 * column. Rounds to the nearest whole minor unit (cents), same rounding
 * convention as `toMinorUnits`/`fromMinorUnits` in `@temp-nx/typeorm`'s
 * `money.ts`.
 */
export interface PoTotalsInput {
  qty: number;
  unitCostMinor: number;
}

export interface PoTotals {
  subtotalMinor: number;
  totalMinor: number;
}

export function computePoTotals(lines: PoTotalsInput[], taxRate?: number | null): PoTotals {
  const subtotalMinor = lines.reduce((sum, line) => sum + line.qty * line.unitCostMinor, 0);
  const taxMinor = taxRate ? Math.round((subtotalMinor * taxRate) / 100) : 0;
  return { subtotalMinor, totalMinor: subtotalMinor + taxMinor };
}
