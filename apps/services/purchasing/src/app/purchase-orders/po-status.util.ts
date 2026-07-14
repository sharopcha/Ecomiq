import { PoStatus } from '../entities/purchase-order.entity';

/**
 * Legal next-states per current status, covering the *entire* plan's PO
 * lifecycle even though only `confirm`/`cancel` are wired in Step 6 —
 * `send` (Step 7) and `receive` (Step 8, which can land a PO on
 * `partially_received` or `received` from either `sent` or `confirmed` —
 * suppliers who ship without ever confirming are still legal, per Step 8's
 * own note) reuse this same table once those methods exist. `received` and
 * `canceled` are terminal.
 *
 * Deliberately a data table backing named, purpose-specific service methods
 * (`confirm()`, `cancel()`, ...) rather than a generic
 * `POST /:id/transition` endpoint taking an arbitrary target status — same
 * inline-per-method-guard style as crm's `ReviewsService.publish()`/
 * `.archive()`, not shipping's `ShipmentsService.transition()`.
 */
const PO_STATUS_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  [PoStatus.Draft]: [PoStatus.Sent, PoStatus.Canceled],
  [PoStatus.Sent]: [PoStatus.Confirmed, PoStatus.PartiallyReceived, PoStatus.Received, PoStatus.Canceled],
  [PoStatus.Confirmed]: [PoStatus.PartiallyReceived, PoStatus.Received, PoStatus.Canceled],
  [PoStatus.PartiallyReceived]: [PoStatus.Received, PoStatus.Canceled],
  [PoStatus.Received]: [],
  [PoStatus.Canceled]: [],
};

export type PoTransitionResult = { ok: true } | { ok: false; reason: 'ILLEGAL_TRANSITION' };

/** Pure — no I/O, easy to exhaustively unit test. `=== false` narrowing only (repo rule: no `strictNullChecks`). */
export function canTransitionPo(from: PoStatus, to: PoStatus): PoTransitionResult {
  if (PO_STATUS_TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }
  return { ok: false, reason: 'ILLEGAL_TRANSITION' };
}

/** Any state that still has at least one legal outgoing transition. */
export function isTerminalPoStatus(status: PoStatus): boolean {
  return PO_STATUS_TRANSITIONS[status].length === 0;
}
