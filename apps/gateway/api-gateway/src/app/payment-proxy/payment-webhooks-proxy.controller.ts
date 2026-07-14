import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Public } from '@temp-nx/auth';
import { proxyRequest } from '../common/service-proxy';

/**
 * The one deliberate exception `PaymentProxyController`'s header comment
 * documents: payment providers don't
 * carry a user JWT, so `/api/payments/webhooks/*` must be reachable without
 * one. A narrowly-scoped `@Public()` sub-route controller, registered
 * *before* the authenticated catch-all in `PaymentProxyModule` so Nest's
 * route resolution picks this more specific path first — the gateway's own
 * global JwtAuthGuard is bypassed here, but the request is still
 * signature-protected downstream (payment-service's `WebhooksController`
 * verifies the provider's HMAC over the raw body before doing anything
 * else). Do **not** "simplify" this by making the whole `PaymentProxyModule`
 * `@Public()` — every other payments route still needs the edge-level 401.
 */
@Controller('payments/webhooks')
@Public()
export class PaymentWebhooksProxyController {
  private readonly paymentBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.paymentBaseUrl = this.config
      .get<string>('PAYMENT_SERVICE_URL', 'http://localhost:3005/api')
      .replace(/\/$/, '');
  }

  @All('*path')
  async proxy(@Req() req: Request, @Res() res: Response) {
    return proxyRequest(req, res, {
      baseUrl: this.paymentBaseUrl,
      // Still strips the full `/api/payments` prefix (not `/api/payments/webhooks`)
      // — the remainder (`/webhooks/:provider`) is what payment-service's
      // own `WebhooksController` (`@Controller('webhooks')`) expects,
      // exactly like `PaymentProxyController`'s stripping for `/intents`.
      matchPrefix: '/api/payments',
    });
  }
}
