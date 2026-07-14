import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The one deliberate exception `ShippingProxyController`'s header comment
 * mentions: carriers don't carry a user JWT, so
 * `/api/shipping/webhooks/*` must be reachable without one. A
 * narrowly-scoped `@Public()` sub-route controller, registered *before*
 * the authenticated catch-all in `ShippingProxyModule` so Nest's route
 * resolution picks this more specific path first — the gateway's own
 * global JwtAuthGuard is bypassed here, but the request is still
 * signature-protected downstream (shipping-service's
 * `TrackingWebhookController` verifies the carrier's HMAC over the raw
 * body before doing anything else). Exact clone of payment's
 * `PaymentWebhooksProxyController`/notification's
 * `NotificationWebhooksProxyController`. Do **not** make the whole
 * `ShippingProxyModule` `@Public()` — every other shipping route still
 * needs the edge-level 401.
 */
@Controller('shipping/webhooks')
@Public()
export class ShippingWebhooksProxyController {
  private readonly shippingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.shippingBaseUrl = this.config
      .get<string>('SHIPPING_SERVICE_URL', 'http://localhost:3008/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      // Still strips the full `/api/shipping` prefix (not
      // `/api/shipping/webhooks`) — the remainder (`/webhooks/tracking`)
      // is what shipping-service's own `TrackingWebhookController`
      // (`@Controller('webhooks')`) expects.
      baseUrl: this.shippingBaseUrl,
      matchPrefix: '/api/shipping',
    });
  }
}
