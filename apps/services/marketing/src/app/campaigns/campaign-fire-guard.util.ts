import { CampaignStatus } from '../entities/campaign.entity';

export type CampaignFireResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_SCHEDULED' | 'STALE_RESCHEDULE' | 'NOT_YET_DUE' };

/**
 * Pure, spec-covered — guards the delayed `marketing.campaign.fire`
 * message's arrival. Pulsar can't cancel
 * a delayed message once produced, so a reschedule (`schedule()` called
 * again on an already-`scheduled` campaign) doesn't retract the earlier
 * message — it arms a *second* one and leaves the stale first one to
 * arrive harmlessly later. This is the standard workaround: the message
 * carries the `scheduleAt` it was armed with; if the campaign's *current*
 * `scheduleAt` differs, this message is stale (a reschedule happened
 * since) and must be ignored — the new message carrying the new time will
 * fire for real when its own delay elapses.
 *
 * `pause()` also relies on this: a paused campaign's `status` alone (not
 * `scheduled`) is enough to no-op any in-flight delayed message, stale or
 * not.
 */
export function assertCampaignFire(
  status: CampaignStatus,
  currentScheduleAt: Date | null | undefined,
  armedScheduleAt: Date,
  now: Date,
): CampaignFireResult {
  if (status !== CampaignStatus.Scheduled) {
    return { ok: false, reason: 'NOT_SCHEDULED' };
  }
  if (!currentScheduleAt || currentScheduleAt.getTime() !== armedScheduleAt.getTime()) {
    return { ok: false, reason: 'STALE_RESCHEDULE' };
  }
  if (now.getTime() < currentScheduleAt.getTime()) {
    return { ok: false, reason: 'NOT_YET_DUE' };
  }
  return { ok: true };
}
