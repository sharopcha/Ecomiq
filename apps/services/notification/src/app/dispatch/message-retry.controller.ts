import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { DispatchService } from './dispatch.service';

interface MessageRetryPayload {
  sendLogId: string;
}

/**
 * The consumer half of the delayed retry self-message. No HTTP routes,
 * same shape as inventory's `ReservationExpiryController`: an
 * `@EventPattern` handler dispatched by a *second* `PulsarServer` (wired in
 * main.ts, subscribed to notification-service's **own** `message.events`
 * topic — this service both publishes and consumes its own message events,
 * unlike the cross-namespace `notify.send` command subscription Step 7
 * adds).
 *
 * `@Public()` + `@SkipThrottle()`: `JwtAuthGuard`/`ThrottlerGuard` are
 * global `APP_GUARD`s that would otherwise reject this RPC (non-HTTP)
 * execution context.
 */
@Controller()
@Public()
@SkipThrottle()
export class MessageRetryController {
  constructor(private readonly dispatch: DispatchService) {}

  @EventPattern('notify.message.retry')
  async onRetry(
    @Payload() payload: MessageRetryPayload,
    @Ctx() _envelope: EventEnvelope<MessageRetryPayload>,
  ): Promise<void> {
    await this.dispatch.redispatch(payload.sendLogId);
  }
}
