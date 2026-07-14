import { ReturnShipping } from '../entities/return-request.entity';

const SHIPPING_SEQUENCE: ReturnShipping[] = [
  ReturnShipping.None,
  ReturnShipping.Sending,
  ReturnShipping.Delivered,
  ReturnShipping.Received,
];

export type AdvanceShippingStatusResult =
  | { ok: true; status: ReturnShipping }
  | { ok: false; reason: 'ALREADY_RECEIVED' };

/**
 * Pure, spec-covered — advances the RMA's shipping chip exactly one step
 * forward (`none → sending → delivered
 * → received`), independent of `ReturnRequest.status`'s own approval
 * lifecycle (data-model rule 3). Same one-step, no-arbitrary-jump shape as
 * `next-stage.util.ts`. `=== false` narrowing only (repo rule: no
 * `strictNullChecks`).
 */
export function advanceShippingStatus(current: ReturnShipping): AdvanceShippingStatusResult {
  const index = SHIPPING_SEQUENCE.indexOf(current);
  if (index === SHIPPING_SEQUENCE.length - 1) {
    return { ok: false, reason: 'ALREADY_RECEIVED' };
  }
  return { ok: true, status: SHIPPING_SEQUENCE[index + 1] };
}
