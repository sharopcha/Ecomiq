import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The one deliberate exception `NotificationProxyController`'s header
 * comment mentions: email providers don't carry a user JWT, so
 * `/api/notifications/webhooks/*` must be reachable without one. A
 * narrowly-scoped `@Public()` sub-route controller, registered *before*
 * the authenticated catch-all in `NotificationProxyModule` so Nest's route
 * resolution picks this more specific path first — the gateway's own
 * global JwtAuthGuard is bypassed here, but the request is still
 * signature-protected downstream (notification-service's
 * `WebhooksController` verifies the provider's HMAC over the raw body
 * before doing anything else). Exact clone of payment's
 * `PaymentWebhooksProxyController`. Do **not** make the whole
 * `NotificationProxyModule` `@Public()` — every other notifications route
 * still needs the edge-level 401.
 */
@Controller('notifications/webhooks')
@Public()
export class NotificationWebhooksProxyController {
  private readonly notificationBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.notificationBaseUrl = this.config
      .get<string>('NOTIFICATION_SERVICE_URL', 'http://localhost:3007/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      // Still strips the full `/api/notifications` prefix (not
      // `/api/notifications/webhooks`) — the remainder (`/webhooks/email`)
      // is what notification-service's own `WebhooksController`
      // (`@Controller('webhooks')`) expects.
      baseUrl: this.notificationBaseUrl,
      matchPrefix: '/api/notifications',
    });
  }
}
