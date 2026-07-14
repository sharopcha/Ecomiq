/**
 * Pure combinatorics/validation for the variant matrix — no TypeORM/DB
 * access, so all of it is directly unit-testable. `ProductVariantsService`
 * is the only caller; kept separate purely for testability, not reuse.
 */

/** Cartesian product of N arrays — expands a product's options into every possible variant combination. */
export function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap((combo) => curr.map((value) => [...combo, value])),
    [[]],
  );
}

/**
 * Order-independent identity for a combination of option-value ids — two
 * variants that reference the same *set* of ids (regardless of the order
 * they were passed in) are the same combination.
 */
export function combinationKey(ids: string[]): string {
  return [...ids].sort().join(',');
}

/**
 * `baseSku` (product.sku) when set, else a short fallback derived from the
 * product's own id, plus a zero-padded sequential suffix (e.g.
 * "MAC-09485 / 09486 / 09487").
 */
export function buildVariantSku(
  baseSku: string | null | undefined,
  fallbackId: string,
  n: number,
): string {
  const base = baseSku?.trim() || fallbackId.slice(-8).toUpperCase();
  return `${base}-${String(n).padStart(3, '0')}`;
}

export interface OptionForValidation {
  id: string;
  values: { id: string }[];
}

export type CombinationValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * Does `optionValueIds` form exactly one valid combination for `options` —
 * one value per option, every option covered, no unknown ids? A product
 * with zero options must pass an empty array. Pure function: the service
 * fetches `options` from the DB and translates a `{ ok: false }` result into
 * a `BadRequestException`; this function itself never throws or touches I/O.
 */
export function validateCombinationCoverage(
  options: OptionForValidation[],
  optionValueIds: string[],
): CombinationValidationResult {
  if (options.length === 0) {
    if (optionValueIds.length > 0) {
      return {
        ok: false,
        reason: 'This product has no options defined — variants cannot specify option values',
      };
    }
    return { ok: true };
  }

  const valueToOption = new Map<string, string>();
  for (const option of options) {
    for (const value of option.values) {
      valueToOption.set(value.id, option.id);
    }
  }

  const coveredOptionIds = new Set<string>();
  for (const id of optionValueIds) {
    const optionId = valueToOption.get(id);
    if (!optionId) {
      return { ok: false, reason: `Option value ${id} does not belong to this product` };
    }
    if (coveredOptionIds.has(optionId)) {
      return { ok: false, reason: 'Only one value per option is allowed on a variant' };
    }
    coveredOptionIds.add(optionId);
  }

  if (coveredOptionIds.size !== options.length) {
    return {
      ok: false,
      reason: `A variant must specify exactly one value for each of this product's ${options.length} option(s)`,
    };
  }

  return { ok: true };
}
