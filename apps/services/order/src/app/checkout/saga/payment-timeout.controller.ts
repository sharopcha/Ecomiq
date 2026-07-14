import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CheckoutSagaOrchestrator } from './checkout-saga.orchestrator';
import { OrderEventType } from '../../events/order-event-types';

interface PaymentTimeoutPayload {
  sagaId: string;
  orderId: string;
}

/**
 * Consumer half of the checkout payment-timeout delayed message
 * (`CheckoutSagaOrchestrator.enterAwaitingPayment`) — dispatched by the
 * `order-self-events::order-service` `PulsarServer` subscription
 * (main.ts), the same connection `ReturnExpiryController` uses.
 */
@Controller()
@Public()
@SkipThrottle()
export class PaymentTimeoutController {
  constructor(private readonly orchestrator: CheckoutSagaOrchestrator) {}

  @EventPattern(OrderEventType.OrderPaymentTimeout)
  async onPaymentTimeout(
    @Payload() payload: PaymentTimeoutPayload,
    @Ctx() _envelope: EventEnvelope<PaymentTimeoutPayload>,
  ): Promise<void> {
    await this.orchestrator.handlePaymentTimeout(payload.sagaId);
  }
}
