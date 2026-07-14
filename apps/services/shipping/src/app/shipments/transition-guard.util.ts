import { ShipmentStatus } from '../entities/shipment.entity';

/**
 * Legal next-states per current status — `draft -> in_progress | canceled`,
 * `in_progress -> arrived | canceled`, `arrived`/`canceled` terminal.
 * Unlike order-service's `nextStage` (which only supports "advance one
 * step"), shipment status is caller-specified via `POST /:id/transition`
 * (the plan's own explicit route shape), so the guard validates an
 * arbitrary target rather than computing the next one.
 */
const LEGAL_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.Draft]: [ShipmentStatus.InProgress, ShipmentStatus.Canceled],
  [ShipmentStatus.InProgress]: [ShipmentStatus.Arrived, ShipmentStatus.Canceled],
  [ShipmentStatus.Arrived]: [],
  [ShipmentStatus.Canceled]: [],
};

export type TransitionResult = { ok: true } | { ok: false; reason: 'ILLEGAL_TRANSITION' };

/** Pure, spec-covered. `=== false` narrowing only (repo rule: no `strictNullChecks`). */
export function canTransition(from: ShipmentStatus, to: ShipmentStatus): TransitionResult {
  if (LEGAL_TRANSITIONS[from].includes(to)) {
    return { ok: true };
  }
  return { ok: false, reason: 'ILLEGAL_TRANSITION' };
}
