import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for shipping-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base URL.
 * Mirrors `NotificationProxyController`/`PaymentProxyController`.
 *
 * shipping-service's own controllers are not prefixed with "shipping" — the
 * gateway owns the `/api/shipping/*` namespace, so `/api/shipping/health`
 * strips down to `/health` before being appended to `SHIPPING_SERVICE_URL`
 * (`http://localhost:3008/api`).
 *
 * Deliberately *not* `@Public()` on this catch-all (zero-trust —
 * shipping-service re-validates the JWT itself). The carrier tracking
 * webhook (`/api/shipping/webhooks/tracking`) and the public tracking page
 * (`/api/shipping/track/*`) each have their own narrowly-scoped `@Public()`
 * sub-route (`ShippingWebhooksProxyController`/`ShippingTrackingProxyController`,
 * both registered before this catch-all in `ShippingProxyModule`).
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/payments` 404 gap for payment-service; the same gap would otherwise
 * exist here for `GET /api/shipping?...`).
 */
@Controller('shipping')
export class ShippingProxyController {
  private readonly shippingBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.shippingBaseUrl = this.config
      .get<string>('SHIPPING_SERVICE_URL', 'http://localhost:3008/api')
      .replace(/\/$/, '');
  }

  @All()
  async proxyRoot(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res);
  }

  // NestJS 11 pins `path-to-regexp` to 8.x, which dropped bare Express 4
  // wildcards (`*`) in favor of named ones (`*path`) — using the old syntax
  // crashes route registration at boot ("pathToRegexp is not a function").
  // `*path` has the same catch-all semantics as the old `*`.
  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.shippingBaseUrl,
      matchPrefix: '/api/shipping',
    });
  }
}
