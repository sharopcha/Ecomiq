import { LicenseKeyStatus } from '../entities/license-key.entity';

export type StatusTransitionResult = { ok: true } | { ok: false; reason: string };

/**
 * Only an Available key can be handed out — reserving one that's already
 * Assigned or Revoked would double-sell the same code (or is a stale/replay
 * request), neither of which should silently succeed.
 */
export function validateReserve(status: LicenseKeyStatus): StatusTransitionResult {
  if (status !== LicenseKeyStatus.Available) {
    return { ok: false, reason: `Cannot reserve a key that is already ${status}` };
  }
  return { ok: true };
}

/**
 * Both Available and Assigned keys can be revoked — Assigned covers "customer
 * refunded, kill the code even though it was already handed out." Revoking an
 * already-revoked key is rejected as a no-op-that-should-error, to catch
 * double-revoke bugs/replays rather than silently succeeding twice.
 */
export function validateRevoke(status: LicenseKeyStatus): StatusTransitionResult {
  if (status === LicenseKeyStatus.Revoked) {
    return { ok: false, reason: 'Key is already revoked' };
  }
  return { ok: true };
}

/**
 * A key can only be hard-deleted while still Available. Once handed out
 * (Assigned) or Revoked, deleting the row would erase the redemption trail —
 * revoke it instead, which keeps history but marks it dead.
 */
export function validateDelete(status: LicenseKeyStatus): StatusTransitionResult {
  if (status !== LicenseKeyStatus.Available) {
    return {
      ok: false,
      reason: `Cannot delete a key that is already ${status} — revoke it instead`,
    };
  }
  return { ok: true };
}
