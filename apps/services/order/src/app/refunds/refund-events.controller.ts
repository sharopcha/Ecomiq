import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { RefundsService } from './refunds.service';
import { RefundExecutionEvent, RefundExecutionEventPayload } from './refund-event-payloads';

/**
 * The refund settlement consumer — dispatched by the *same*
 * `payment-events::order-service` `PulsarServer` subscription
 * `PaymentEventsController` uses: refund events ride payment-service's
 * own `payment.events` topic (same aggregate as the
 * intent lifecycle — see payment-service's `PaymentEventType` doc comment),
 * so no new `connectMicroservice` connection is needed here, just another
 * controller with its own `@EventPattern`s registered into the same
 * microservice context.
 */
@Controller()
@Public()
@SkipThrottle()
export class RefundEventsController {
  constructor(private readonly refunds: RefundsService) {}

  @EventPattern(RefundExecutionEvent.Succeeded)
  async onRefundSucceeded(
    @Payload() payload: RefundExecutionEventPayload,
    @Ctx() _envelope: EventEnvelope<RefundExecutionEventPayload>,
  ): Promise<void> {
    await this.refunds.handleRefundSucceeded(payload.refundId);
  }

  @EventPattern(RefundExecutionEvent.Failed)
  async onRefundFailed(
    @Payload() payload: RefundExecutionEventPayload,
    @Ctx() _envelope: EventEnvelope<RefundExecutionEventPayload>,
  ): Promise<void> {
    await this.refunds.handleRefundFailed(payload.refundId, payload.failureReason ?? undefined);
  }
}
