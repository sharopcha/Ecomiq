import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  InternalAuthGuard,
  PermissionsGuard,
  Public,
  RequireInternalScope,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { ScheduleCampaignDto } from './dto/schedule-campaign.dto';
import { RecordSendEventDto } from './dto/record-send-event.dto';

/**
 * `/api/marketing/campaigns/*` (gateway strips `/api/marketing`, so this
 * controller mounts at `campaigns`, not `marketing/campaigns` — same
 * convention as `DiscountsController`). Uses the same `campaign` permission
 * workspace.
 */
@Controller('campaigns')
@UseGuards(PermissionsGuard)
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @RequirePermissions('campaign:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.campaigns.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('campaign:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('campaign:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('campaign:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaigns.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('campaign:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.remove(user.storeId, id);
  }

  @Post(':id/schedule')
  @RequirePermissions('campaign:write')
  schedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.campaigns.schedule(user.storeId, id, dto);
  }

  @Post(':id/pause')
  @RequirePermissions('campaign:write')
  pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.pause(user.storeId, id);
  }

  @Post(':id/archive')
  @RequirePermissions('campaign:write')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.campaigns.archive(user.storeId, id);
  }

  /**
   * Engagement write-back — called exclusively by notification-service's
   * webhook forwarder (`WebhookDispatchService`), never a browser/end
   * user, so this route authenticates via an internal service-credential
   * token (`InternalAuthGuard`/`@RequireInternalScope`) instead of the
   * ambient per-user `JwtAuthGuard`/`PermissionsGuard` every other route on
   * this controller uses. `@Public()` bypasses the global `JwtAuthGuard`
   * (which would otherwise reject an internal token outright — see
   * `JwtAccessStrategy`'s `type !== 'access'` guard) for this one route;
   * the class-level `@UseGuards(PermissionsGuard)` still runs but is a
   * no-op here since nothing on this handler carries `@RequirePermissions`
   * metadata. `storeId` comes from the request body (`RecordSendEventDto`),
   * not `@CurrentUser()` — there is no authenticated user in this flow.
   */
  @Post(':id/sends/:sendId/events')
  @Public()
  @UseGuards(InternalAuthGuard)
  @RequireInternalScope('marketing:record_send_event')
  recordSendEvent(
    @Param('id') id: string,
    @Param('sendId') sendId: string,
    @Body() dto: RecordSendEventDto,
  ) {
    return this.campaigns.recordSendEvent(dto.storeId, id, sendId, dto.kind);
  }
}
