import { BadRequestException, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '@temp-nx/auth';
import { EmailProviderPort } from '../channels/email-provider.port';
import { WebhookDispatchService } from './webhook-dispatch.service';

/**
 * `POST /api/notifications/webhooks/email` — `@Public()` (providers don't
 * carry a user JWT; the HMAC signature is the actual auth). Relies on the
 * app being bootstrapped with `rawBody: true` (main.ts) — same as
 * payment's `WebhooksController`, which this mirrors closely. A real
 * provider adapter later replaces the signature scheme
 * `EmailProviderPort.verifyWebhookSignature` implements, not this route —
 * only "email" exists as a webhook-capable channel today (SMS/WhatsApp
 * providers don't get delivery-event webhooks in this plan).
 */
@Controller('webhooks')
@Public()
export class WebhooksController {
  constructor(
    private readonly emailProvider: EmailProviderPort,
    private readonly dispatch: WebhookDispatchService,
  ) {}

  @Post('email')
  @HttpCode(200)
  async handleEmail(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    const verify = this.emailProvider.verifyWebhookSignature(rawBody, this.flattenHeaders(req.headers));
    // `=== false` narrowing only — repo rule.
    if (verify.ok === false) {
      throw new BadRequestException(`Webhook signature verification failed: ${verify.reason}`);
    }

    const event = this.emailProvider.parseWebhookEvent(rawBody);
    await this.dispatch.handle(event);
    return { status: 'ok' };
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
