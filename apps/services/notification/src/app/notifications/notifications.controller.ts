import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { NotificationsService } from './notifications.service';
import { FeedQueryDto } from './dto/feed-query.dto';

/**
 * Mounted at the bare service root (`@Controller()`, no prefix) — the
 * gateway's `NotificationProxyController` already owns the whole
 * `/api/notifications/*` namespace and strips that entire prefix before
 * forwarding, so `GET /api/notifications` (bare) arrives here as `GET /api`
 * and `GET /api/notifications/unread-count` arrives as `GET /api/unread-count`.
 * Same convention as `TemplatesController`, just with an empty local prefix
 * instead of `templates` since the plan's own endpoint paths
 * (`/api/notifications`, `/api/notifications/unread-count`, ...) put the
 * feed directly under the gateway's namespace rather than a sub-resource.
 */
@Controller()
@UseGuards(PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('notifications:read')
  findFeed(@CurrentUser() user: AuthenticatedUser, @Query() query: FeedQueryDto) {
    return this.notifications.findFeed(user.storeId, user.id, query);
  }

  @Get('unread-count')
  @RequirePermissions('notifications:read')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notifications.unreadCount(user.storeId, user.id);
    return { count };
  }

  @Post(':id/read')
  @RequirePermissions('notifications:write')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.storeId, user.id, id);
  }

  @Post('read-all')
  @RequirePermissions('notifications:write')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.storeId, user.id);
  }
}
