import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { DispatchService } from '../dispatch/dispatch.service';
import { mapReturnApproved } from './map-return-approved.util';
import { RETURN_APPROVED_EVENT_TYPE, ReturnApprovedPayload } from './return-approved-event-payload';

/**
 * Cross-namespace consumer of order's `return.events` topic — same
 * precedent as `NotifyCommandsController`/`StockLowController`. Only
 * `orders.return.approved` has a handler here; every other
 * `orders.return.*` event (created/rejected/resolved/expired/...) on the
 * same topic is automatically ack-and-ignored by `PulsarServer` itself (no
 * `@EventPattern` registered for them).
 */
@Controller()
@Public()
@SkipThrottle()
export class ReturnEventsController {
  private readonly logger = new Logger(ReturnEventsController.name);

  constructor(private readonly dispatch: DispatchService) {}

  @EventPattern(RETURN_APPROVED_EVENT_TYPE)
  async onReturnApproved(
    @Payload() payload: ReturnApprovedPayload,
    @Ctx() envelope: EventEnvelope<ReturnApprovedPayload>,
  ): Promise<void> {
    const mapped = mapReturnApproved(payload);
    if (mapped.action === 'skip') {
      this.logger.log(`orders.return.approved skipped (sourceEventId=${envelope.eventId}): ${mapped.reason}`);
      return;
    }

    await this.dispatch.dispatch({
      storeId: envelope.storeId,
      sourceEventId: envelope.eventId,
      ...mapped.input,
    });
  }
}
