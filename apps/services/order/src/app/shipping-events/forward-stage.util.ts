import { OrderStage } from '../entities/order.entity';

const STAGE_SEQUENCE: OrderStage[] = [
  OrderStage.ReviewOrder,
  OrderStage.PreparingOrder,
  OrderStage.Shipping,
  OrderStage.Delivered,
];

/**
 * Advances to `target` only if it's further along `STAGE_SEQUENCE` than
 * `current` — never regresses. Unlike `next-stage.util.ts`'s `nextStage()`
 * (advance by exactly one, for the merchant-driven stepper UI), shipping
 * events name an explicit target stage directly (`in_progress` implies
 * `shipping`, `arrived` implies `delivered`), and a redelivered or
 * out-of-order event must not walk a `delivered` order back to `shipping`.
 */
export function forwardStage(current: OrderStage, target: OrderStage): OrderStage {
  const currentIndex = STAGE_SEQUENCE.indexOf(current);
  const targetIndex = STAGE_SEQUENCE.indexOf(target);
  return targetIndex > currentIndex ? target : current;
}
