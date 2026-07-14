import { Controller } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { DispatchService } from '../dispatch/dispatch.service';
import { mapStockLowActions } from './map-stock-low.util';
import { STOCK_LOW_EVENT_TYPE, StockLowPayload } from './stock-low-event-payload';

/**
 * Cross-namespace consumer of inventory's `stock_level.events` topic — same
 * precedent as `NotifyCommandsController` subscribing to marketing's
 * `notify.commands` (the tenant-level agreement is on where producers
 * publish, not which service's namespace a consumer lives in). Only
 * `inventory.stock.low` has a handler here; `inventory.stock.adjusted`/
 * `inventory.reorder.triggered` arrive on the same topic and are
 * automatically ack-and-ignored by `PulsarServer` itself (no `@EventPattern`
 * registered for them — see that class's `handleMessage` doc comment).
 *
 * `@Public()` + `@SkipThrottle()`: same reason as every other
 * `@EventPattern` controller in this repo.
 */
@Controller()
@Public()
@SkipThrottle()
export class StockLowController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly config: ConfigService,
  ) {}

  @EventPattern(STOCK_LOW_EVENT_TYPE)
  async onStockLow(
    @Payload() payload: StockLowPayload,
    @Ctx() envelope: EventEnvelope<StockLowPayload>,
  ): Promise<void> {
    const staffEmail = this.config.get<string>('NOTIFICATION_STAFF_EMAIL', 'staff@example.com');
    const staffPhone = this.config.get<string>('NOTIFICATION_STAFF_PHONE', '+10000000000');
    const items = mapStockLowActions(envelope.eventId, payload, staffEmail, staffPhone);

    for (const item of items) {
      await this.dispatch.dispatch({
        storeId: envelope.storeId,
        sourceEventId: item.sourceEventId,
        ...item.input,
      });
    }
  }
}
