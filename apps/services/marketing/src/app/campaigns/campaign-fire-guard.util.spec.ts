import { CampaignStatus } from '../entities/campaign.entity';
import { assertCampaignFire } from './campaign-fire-guard.util';

describe('assertCampaignFire', () => {
  const armed = new Date('2026-01-01T00:00:00Z');
  const due = new Date('2026-01-01T00:00:01Z');
  const early = new Date('2025-12-31T23:59:59Z');

  it('fires when scheduled, scheduleAt matches, and it is due', () => {
    const result = assertCampaignFire(CampaignStatus.Scheduled, armed, armed, due);
    expect(result.ok).toBe(true);
  });

  it('rejects when the campaign is not scheduled (e.g. paused before fire)', () => {
    const result = assertCampaignFire(CampaignStatus.Paused, armed, armed, due);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('NOT_SCHEDULED');
  });

  it('rejects a stale message whose armed time no longer matches (a reschedule happened)', () => {
    const rescheduled = new Date('2026-01-01T01:00:00Z');
    const result = assertCampaignFire(CampaignStatus.Scheduled, rescheduled, armed, due);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('STALE_RESCHEDULE');
  });

  it('rejects a message arriving before its scheduleAt has genuinely passed', () => {
    const result = assertCampaignFire(CampaignStatus.Scheduled, armed, armed, early);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('NOT_YET_DUE');
  });

  it('rejects when the campaign has no scheduleAt at all', () => {
    const result = assertCampaignFire(CampaignStatus.Scheduled, null, armed, due);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('STALE_RESCHEDULE');
  });
});
