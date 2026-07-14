import { CampaignStatus } from '../entities/campaign.entity';

export type ScheduleCampaignResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_SCHEDULABLE' | 'SCHEDULE_NOT_FUTURE' };

/**
 * Pure, spec-covered — a campaign can be armed for sending from `draft`
 * (the initial arm) or re-armed from `scheduled` (a genuine reschedule:
 * `campaigns.service.ts`'s `schedule()` arms a brand-new delayed message
 * with the new time every call, and the fire handler's own reschedule
 * guard is what makes the stale earlier message a safe no-op — see
 * `assertCampaignFire`). Once
 * `sending`/`sent`/`paused`/`archived`, scheduling is no longer legal.
 * `scheduleAt` must be strictly after `now`. `=== false` narrowing only
 * (repo rule: no `strictNullChecks`).
 */
export function assertScheduleCampaign(
  status: CampaignStatus,
  scheduleAt: Date,
  now: Date,
): ScheduleCampaignResult {
  if (status !== CampaignStatus.Draft && status !== CampaignStatus.Scheduled) {
    return { ok: false, reason: 'NOT_SCHEDULABLE' };
  }
  if (scheduleAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'SCHEDULE_NOT_FUTURE' };
  }
  return { ok: true };
}

export type PauseCampaignResult = { ok: true } | { ok: false; reason: 'NOT_SCHEDULED' };

/**
 * Pausing only makes sense while a send is armed but not yet underway
 * (`scheduled`) — `sending` is the fire handler's own narrow in-flight
 * window and isn't a legal target for a manual pause.
 */
export function assertPauseCampaign(status: CampaignStatus): PauseCampaignResult {
  if (status !== CampaignStatus.Scheduled) {
    return { ok: false, reason: 'NOT_SCHEDULED' };
  }
  return { ok: true };
}
