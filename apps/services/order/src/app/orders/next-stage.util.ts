import { OrderStage } from '../entities/order.entity';

const STAGE_SEQUENCE: OrderStage[] = [
  OrderStage.ReviewOrder,
  OrderStage.PreparingOrder,
  OrderStage.Shipping,
  OrderStage.Delivered,
];

export type NextStageResult =
  | { ok: true; stage: OrderStage }
  | { ok: false; reason: 'ALREADY_AT_FINAL_STAGE' };

/**
 * Pure, spec-covered — advances the 4-step stepper exactly one step
 * forward from `current`. Monotonic by
 * construction: there is no "set to an arbitrary stage" entry point, only
 * "advance," so a caller can never move a stage backward or skip ahead.
 * `=== false` narrowing only (repo rule: no `strictNullChecks`).
 */
export function nextStage(current: OrderStage): NextStageResult {
  const index = STAGE_SEQUENCE.indexOf(current);
  if (index === STAGE_SEQUENCE.length - 1) {
    return { ok: false, reason: 'ALREADY_AT_FINAL_STAGE' };
  }
  return { ok: true, stage: STAGE_SEQUENCE[index + 1] };
}
