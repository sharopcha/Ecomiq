import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CustomersService } from '../customers/customers.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ReferralsService } from '../referrals/referrals.service';
import { ORDER_PLACED_EVENT_TYPE, OrderPlacedPayload } from '../events/order-placed-event-payload';

/**
 * Cross-namespace consumer of order's `order.events` topic — same
 * precedent as shipping's `OrderEventsController`. One subscription, one
 * `@EventPattern` method — every idempotent business-logic reaction to
 * `orders.order.placed` (rollup, loyalty accrual, referral completion) is a
 * separate call inside this same method. Each reaction picks whatever
 * idempotency mechanism fits its own data: the rollup has no natural key (a
 * plain increment), so it claims `(eventId, handler)` in `processed_event`;
 * loyalty accrual's `ref_id` (the order id) already *is* a natural key, so
 * it dedupes via a partial unique index on its own `loyalty_txn` table
 * instead; referral completion reuses that same mechanism again (its own
 * `ref_id` is the referral's id) and additionally gates on `pending` status,
 * which is itself idempotent (a second call finds nothing pending to
 * complete). Every other `orders.order.*` event on this topic is
 * automatically ack-and-ignored by `PulsarServer` itself (no `@EventPattern`
 * registered for them).
 */
@Controller()
@Public()
@SkipThrottle()
export class OrderEventsController {
  private readonly logger = new Logger(OrderEventsController.name);

  constructor(
    private readonly customers: CustomersService,
    private readonly loyalty: LoyaltyService,
    private readonly referrals: ReferralsService,
  ) {}

  @EventPattern(ORDER_PLACED_EVENT_TYPE)
  async onOrderPlaced(
    @Payload() payload: OrderPlacedPayload,
    @Ctx() envelope: EventEnvelope<OrderPlacedPayload>,
  ): Promise<void> {
    this.logger.log(`orders.order.placed received (eventId=${envelope.eventId}, orderId=${payload.orderId})`);
    const customer = await this.customers.applyOrderRollup(envelope.storeId, envelope.eventId, payload);

    if (payload.customerId) {
      await this.loyalty.accrueForOrder(envelope.storeId, payload.customerId, payload.orderId, payload.totalMinor);
    }

    // `customer` is undefined on a replay (already claimed) or when there's
    // no customerId/no matching customer — in every one of those cases
    // there's nothing new to evaluate for referral completion either.
    if (customer) {
      await this.referrals.completeIfEligible(envelope.storeId, customer, payload.orderId);
    }
  }
}
