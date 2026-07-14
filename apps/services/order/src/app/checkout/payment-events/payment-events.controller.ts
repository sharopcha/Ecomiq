import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CheckoutSagaOrchestrator } from '../saga/checkout-saga.orchestrator';
import { PaymentEvent, PaymentFailedPayload, PaymentSucceededPayload } from './payment-event-payloads';

/**
 * The checkout saga's payment-result consumer — dispatched by the
 * `payment-events::order-service` `PulsarServer`
 * subscription wired in `main.ts` (payment-service's own `payments`
 * namespace, not order-service's). No HTTP routes, same
 * `@Public()`/`@SkipThrottle()` shape as every other Pulsar-facing
 * controller in this repo (the global `JwtAuthGuard`/`ThrottlerGuard`
 * would otherwise reject this non-HTTP execution context).
 */
@Controller()
@Public()
@SkipThrottle()
export class PaymentEventsController {
  constructor(private readonly orchestrator: CheckoutSagaOrchestrator) {}

  @EventPattern(PaymentEvent.Succeeded)
  async onPaymentSucceeded(
    @Payload() payload: PaymentSucceededPayload,
    @Ctx() _envelope: EventEnvelope<PaymentSucceededPayload>,
  ): Promise<void> {
    await this.orchestrator.handlePaymentSucceeded(payload.orderId, payload.paymentId);
  }

  @EventPattern(PaymentEvent.Failed)
  async onPaymentFailed(
    @Payload() payload: PaymentFailedPayload,
    @Ctx() _envelope: EventEnvelope<PaymentFailedPayload>,
  ): Promise<void> {
    await this.orchestrator.handlePaymentFailed(
      payload.orderId,
      `payment failed: ${payload.failureReason ?? 'unknown reason'}`,
    );
  }
}
