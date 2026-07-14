import { BadRequestException, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '@temp-nx/auth';
import { PaymentProviderPort } from '../provider/payment-provider.port';
import { WebhookDispatchService } from './webhook-dispatch.service';

/**
 * `POST /api/payments/webhooks/:provider` — `@Public()` (providers don't
 * carry user JWTs; the HMAC signature is the actual auth). Relies on the
 * app being bootstrapped with `rawBody: true` (main.ts) — NestJS's built-in
 * raw-body capture, not a hand-rolled `express.raw()` scoped to this path —
 * so `req.rawBody` is available here while every other route in this
 * service keeps normal JSON body parsing (repo rule: raw-body handling
 * must be scoped to the webhook path, not service-wide).
 *
 * Signature verification runs over the *exact bytes* (`rawBody`), never a
 * re-serialized `JSON.stringify(req.body)` — the whole reason a raw body is
 * needed at all.
 */
@Controller('webhooks')
@Public()
export class WebhooksController {
  constructor(
    private readonly provider: PaymentProviderPort,
    private readonly dispatch: WebhookDispatchService,
  ) {}

  @Post(':provider')
  @HttpCode(200)
  async handle(@Param('provider') providerName: string, @Req() req: RawBodyRequest<Request>) {
    if (providerName !== this.provider.name) {
      throw new BadRequestException(`Unknown provider "${providerName}"`);
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    const verify = this.provider.verifyWebhookSignature(rawBody, this.flattenHeaders(req.headers));
    // `=== false` narrowing only — repo rule.
    if (verify.ok === false) {
      throw new BadRequestException(`Webhook signature verification failed: ${verify.reason}`);
    }

    const event = this.provider.parseWebhookEvent(rawBody);
    return this.dispatch.handle(providerName, rawBody, event);
  }

  /** Express headers can be `string | string[] | undefined` — the provider port's signature only cares about single string values. */
  private flattenHeaders(headers: Request['headers']): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') flat[key] = value;
      else if (Array.isArray(value)) flat[key] = value[0];
    }
    return flat;
  }
}
