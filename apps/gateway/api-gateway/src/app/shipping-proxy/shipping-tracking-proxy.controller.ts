import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The public tracking API `ShippingProxyController`'s header comment
 * flagged as needing the same treatment as the webhooks sub-route: a
 * stranger with a display id or tracking number carries no JWT. Narrowly
 * scoped to `/shipping/track/*` only — every other shipping route still
 * needs the edge-level 401. Rate limiting is still enforced (shipping-
 * service's own `TrackingController` applies `@Throttle` per route, not
 * `@SkipThrottle()`), same as identity's `POST /auth/token`.
 */
@Controller('shipping/track')
@Public()
export class ShippingTrackingProxyController {
  private readonly shippingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.shippingBaseUrl = this.config
      .get<string>('SHIPPING_SERVICE_URL', 'http://localhost:3008/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      // Strips the full `/api/shipping` prefix — the remainder
      // (`/track/:storeSlugOrId/:displayIdOrTracking`) is what
      // shipping-service's own `TrackingController` (`@Controller('track')`)
      // expects.
      baseUrl: this.shippingBaseUrl,
      matchPrefix: '/api/shipping',
    });
  }
}
