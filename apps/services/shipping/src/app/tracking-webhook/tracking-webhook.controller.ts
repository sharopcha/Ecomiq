import { BadRequestException, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '@temp-nx/auth';
import { TrackingWebhookService } from './tracking-webhook.service';
import { TRACKING_SIGNATURE_HEADER, verifyTrackingWebhookSignature } from './signature.util';
import { CarrierTrackingWebhookEvent } from './tracking-webhook-event';

/**
 * `POST /api/shipping/webhooks/tracking` — `@Public()` (carriers don't
 * carry a user JWT; the HMAC signature is the actual auth). Relies on the
 * app being bootstrapped with `rawBody: true` (main.ts) — same as
 * payment's/notification's `WebhooksController`, which this mirrors
 * closely. A real carrier adapter later replaces `SHIPPING_WEBHOOK_SECRET`'s
 * signing scheme, not this route.
 */
@Controller('webhooks')
@Public()
export class TrackingWebhookController {
  constructor(
    private readonly service: TrackingWebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('tracking')
  @HttpCode(200)
  async handleTracking(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    const secret = this.config.get<string>('SHIPPING_WEBHOOK_SECRET', 'dev-mock-webhook-secret');
    const signature = this.flattenHeaders(req.headers)[TRACKING_SIGNATURE_HEADER];
    if (!verifyTrackingWebhookSignature(rawBody, signature, secret)) {
      throw new BadRequestException('Webhook signature verification failed');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as CarrierTrackingWebhookEvent;
    await this.service.handle(event);
    return { status: 'ok' };
  }

  /** Express headers can be `string | string[] | undefined` — the signature check only cares about a single string value. */
  private flattenHeaders(headers: Request['headers']): Record<string, string> {
    const flat: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') flat[key] = value;
      else if (Array.isArray(value)) flat[key] = value[0];
    }
    return flat;
  }
}
