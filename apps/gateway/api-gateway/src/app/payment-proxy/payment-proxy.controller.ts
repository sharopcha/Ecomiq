import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { proxyRequest } from '../common/service-proxy';

/**
 * Thin reverse proxy for payment-service — all forwarding mechanics (raw
 * body passthrough, hop-by-hop header stripping, multi-value set-cookie,
 * 3xx relay, upstream timeout) live in the shared `proxyRequest` handler;
 * this controller only knows its own path-rewrite rule and base URL.
 * Mirrors `CatalogProxyController`/`InventoryProxyController`.
 *
 * payment-service's own controllers are not prefixed with "payments" — the
 * gateway owns the `/api/payments/*` namespace, so `/api/payments/health`
 * strips down to `/health` before being appended to `PAYMENT_SERVICE_URL`
 * (`http://localhost:3005/api`).
 *
 * Deliberately *not* `@Public()` on this catch-all (zero-trust —
 * payment-service re-validates the JWT itself). One deliberate exception:
 * the provider-webhook route (`/api/payments/webhooks/*`) must be reachable
 * *without* a user JWT — providers don't carry one. That's handled by a
 * separate, narrowly-scoped `@Public()` sub-route controller
 * (`PaymentWebhooksProxyController`) in `PaymentProxyModule`, ordered
 * *before* this catch-all controller so Nest's route-matching picks the
 * more specific path first.
 *
 * Two `@All()` routes, not one — see `CatalogProxyController`'s doc comment
 * for the full reasoning (a live gateway smoke test found the bare
 * `/api/payments` 404 gap — this is exactly the route
 * `GET /api/payments?orderId=` needs, so it was silently broken until now).
 */
@Controller('payments')
export class PaymentProxyController {
  private readonly paymentBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.paymentBaseUrl = this.config
      .get<string>('PAYMENT_SERVICE_URL', 'http://localhost:3005/api')
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
      baseUrl: this.paymentBaseUrl,
      matchPrefix: '/api/payments',
    });
  }
}
