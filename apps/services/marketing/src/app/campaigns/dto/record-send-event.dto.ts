import { IsEnum, IsString, MinLength } from 'class-validator';

export enum CampaignSendEventKind {
  Opened = 'opened',
  Clicked = 'clicked',
  Bounced = 'bounced',
}

export class RecordSendEventDto {
  @IsEnum(CampaignSendEventKind)
  kind!: CampaignSendEventKind;

  /**
   * Only caller today is notification-service's webhook forwarder
   * (an internal service-credential token, not a per-user session) — there
   * is no `@CurrentUser()` to read `storeId` off of, so the caller passes
   * it explicitly. `recordSendEvent` still scopes the lookup by this value
   * (same as every other tenant-scoped query), so a store mismatch 404s
   * exactly like a wrong-store id would for a normal user-authenticated call.
   */
  @IsString()
  @MinLength(1)
  storeId!: string;
}
