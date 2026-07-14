export type AutoDraftEligibility =
  | { eligible: true }
  | { eligible: false; reason: 'NOT_PURCHASE_ORDER_METHOD' }
  | { eligible: false; reason: 'NO_PREFERRED_SUPPLIER' };

/**
 * Pure eligibility check for `AutoDraftPoService.applyReorderTriggered()`:
 * an `inventory.reorder.triggered` event only ever drafts a PO when the
 * rule's method is `purchase_order` (the `restock_alert` path is out of
 * scope here, inventory sends its own alert) and a `preferredSupplierId` is
 * set (null means the merchant already sees inventory's own alert with
 * nothing for purchasing to act on).
 */
export function checkAutoDraftEligibility(payload: {
  method: string;
  preferredSupplierId?: string | null;
}): AutoDraftEligibility {
  if (payload.method !== 'purchase_order') {
    return { eligible: false, reason: 'NOT_PURCHASE_ORDER_METHOD' };
  }
  if (!payload.preferredSupplierId) {
    return { eligible: false, reason: 'NO_PREFERRED_SUPPLIER' };
  }
  return { eligible: true };
}
