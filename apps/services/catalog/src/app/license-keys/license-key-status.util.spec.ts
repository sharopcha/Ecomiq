import { LicenseKeyStatus } from '../entities/license-key.entity';
import { validateDelete, validateReserve, validateRevoke } from './license-key-status.util';

describe('validateReserve', () => {
  it('allows reserving an Available key', () => {
    expect(validateReserve(LicenseKeyStatus.Available)).toEqual({ ok: true });
  });

  it('rejects reserving an Assigned key', () => {
    const result = validateReserve(LicenseKeyStatus.Assigned);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/already assigned/i);
    }
  });

  it('rejects reserving a Revoked key', () => {
    const result = validateReserve(LicenseKeyStatus.Revoked);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/already revoked/i);
    }
  });
});

describe('validateRevoke', () => {
  it('allows revoking an Available key', () => {
    expect(validateRevoke(LicenseKeyStatus.Available)).toEqual({ ok: true });
  });

  it('allows revoking an Assigned key (e.g. refund)', () => {
    expect(validateRevoke(LicenseKeyStatus.Assigned)).toEqual({ ok: true });
  });

  it('rejects revoking an already-Revoked key', () => {
    const result = validateRevoke(LicenseKeyStatus.Revoked);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/already revoked/i);
    }
  });
});

describe('validateDelete', () => {
  it('allows deleting an Available key', () => {
    expect(validateDelete(LicenseKeyStatus.Available)).toEqual({ ok: true });
  });

  it('rejects deleting an Assigned key', () => {
    const result = validateDelete(LicenseKeyStatus.Assigned);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/revoke it instead/i);
    }
  });

  it('rejects deleting a Revoked key', () => {
    const result = validateDelete(LicenseKeyStatus.Revoked);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toMatch(/revoke it instead/i);
    }
  });
});
