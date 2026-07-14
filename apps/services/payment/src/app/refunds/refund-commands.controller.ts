import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { RefundsService } from './refunds.service';
import { REFUND_EXECUTE_COMMAND, RefundExecuteCommandPayload } from './refund-command-payloads';

/**
 * Pulsar-facing side of the `payments.refund.execute` command consumer.
 * No HTTP routes — dispatched by the
 * `PulsarServer` microservice connection in `main.ts` (subscribed to the
 * `payment.commands` topic via `topicForCommands`, not `topicForAggregate`
 * — see that connection's own comment for why).
 *
 * `@Payload()`/`@Ctx()` are required, not decorative — repo rule
 * (`catalog-sync.controller.ts`'s doc comment has the full "arrives as
 * undefined" story). `@Public()` + `@SkipThrottle()`: same non-HTTP
 * execution-context bypass every other Pulsar-facing controller in this
 * repo needs, since `JwtAuthGuard`/`ThrottlerGuard` are global `APP_GUARD`s.
 */
@Controller()
@Public()
@SkipThrottle()
export class RefundCommandsController {
  constructor(private readonly refunds: RefundsService) {}

  @EventPattern(REFUND_EXECUTE_COMMAND)
  async onRefundExecute(
    @Payload() payload: RefundExecuteCommandPayload,
    @Ctx() envelope: EventEnvelope<RefundExecuteCommandPayload>,
  ): Promise<void> {
    await this.refunds.executeRefund({
      refundId: payload.refundId,
      orderId: payload.orderId,
      paymentId: payload.paymentId,
      storeId: envelope.storeId,
      amountMinor: payload.amountMinor,
      reason: payload.reason,
    });
  }
}
