import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { ReturnsService } from './returns.service';
import { OrderEventType } from '../events/order-event-types';

interface ReturnExpiryCheckPayload {
  returnRequestId: string;
}

/**
 * The consumer half of the RMA auto-expiry delayed message. No HTTP
 * routes, same shape as inventory's `ReservationExpiryController`: an
 * `@EventPattern` handler dispatched by a *second* `PulsarServer` (wired in
 * main.ts, subscribed to order-service's **own** `return.events` topic).
 *
 * `@Public()` + `@SkipThrottle()` for the same reason as every other
 * Pulsar-facing controller in this repo: `JwtAuthGuard`/`ThrottlerGuard`
 * are global `APP_GUARD`s that would otherwise reject this non-HTTP
 * execution context.
 */
@Controller()
@Public()
@SkipThrottle()
export class ReturnExpiryController {
  constructor(private readonly returns: ReturnsService) {}

  @EventPattern(OrderEventType.ReturnExpiryCheck)
  async onExpiryCheck(
    @Payload() payload: ReturnExpiryCheckPayload,
    @Ctx() envelope: EventEnvelope<ReturnExpiryCheckPayload>,
  ): Promise<void> {
    await this.returns.expire(envelope.storeId, payload.returnRequestId);
  }
}
