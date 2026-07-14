import { CampaignStatus } from '../entities/campaign.entity';
import { assertPauseCampaign, assertScheduleCampaign } from './campaign-transitions.util';

describe('assertScheduleCampaign', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const future = new Date('2026-01-01T00:00:01Z');
  const past = new Date('2025-12-31T23:59:59Z');

  it('allows scheduling a draft campaign for a future time', () => {
    const result = assertScheduleCampaign(CampaignStatus.Draft, future, now);
    expect(result.ok).toBe(true);
  });

  it('allows rescheduling an already-scheduled campaign', () => {
    const result = assertScheduleCampaign(CampaignStatus.Scheduled, future, now);
    expect(result.ok).toBe(true);
  });

  it.each([CampaignStatus.Sending, CampaignStatus.Sent, CampaignStatus.Paused, CampaignStatus.Archived])(
    'rejects scheduling from %s',
    (status) => {
      const result = assertScheduleCampaign(status, future, now);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('NOT_SCHEDULABLE');
    },
  );

  it('rejects a scheduleAt in the past', () => {
    const result = assertScheduleCampaign(CampaignStatus.Draft, past, now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('SCHEDULE_NOT_FUTURE');
  });

  it('rejects a scheduleAt exactly equal to now', () => {
    const result = assertScheduleCampaign(CampaignStatus.Draft, now, now);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('SCHEDULE_NOT_FUTURE');
  });
});

describe('assertPauseCampaign', () => {
  it('allows pausing a scheduled campaign', () => {
    const result = assertPauseCampaign(CampaignStatus.Scheduled);
    expect(result.ok).toBe(true);
  });

  it.each([
    CampaignStatus.Draft,
    CampaignStatus.Sending,
    CampaignStatus.Sent,
    CampaignStatus.Paused,
    CampaignStatus.Archived,
  ])('rejects pausing from %s', (status) => {
    const result = assertPauseCampaign(status);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('NOT_SCHEDULED');
  });
});
