export interface BundleItemInput {
  variantId: string;
  qty: number;
}

export type BundleItemsValidationResult = { ok: true } | { ok: false; reason: string };

/**
 * A bundle's item list must reference each variant at most once (to include
 * more of the same variant, raise its `qty` instead) and every `qty` must be
 * a positive integer. class-validator's DTO-level `@Min(1)`/`@IsInt()` already
 * catch a bad `qty` on a single item in isolation; this catches the
 * cross-item duplicate-variant case, which no single field validator can see.
 * Pure — no DB access — so the service just fetches nothing extra to call this.
 */
export function validateBundleItems(items: BundleItemInput[]): BundleItemsValidationResult {
  if (items.length === 0) {
    return { ok: false, reason: 'A bundle must contain at least one item' };
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.variantId)) {
      return {
        ok: false,
        reason: `Variant ${item.variantId} appears more than once — raise its qty instead of repeating it`,
      };
    }
    seen.add(item.variantId);

    if (!Number.isInteger(item.qty) || item.qty < 1) {
      return {
        ok: false,
        reason: `qty for variant ${item.variantId} must be a positive integer`,
      };
    }
  }

  return { ok: true };
}
