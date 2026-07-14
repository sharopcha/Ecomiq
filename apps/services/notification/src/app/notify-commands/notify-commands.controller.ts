import { Controller, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { DispatchService } from '../dispatch/dispatch.service';
import { mapNotifyCommand, mapPickupReminder } from './map-notify-command.util';

/**
 * The integration proof — subscribes to **marketing's** `notify.commands`
 * topic (`MARKETING_PULSAR_NAMESPACE`, cross-namespace consumption, same
 * precedent as inventory's `CatalogSyncController` subscribing to
 * catalog's own topic: the tenant-level agreement is on *where the
 * producers publish*, not which service's namespace a consumer lives in).
 * Every `notify.send` command in this repo — marketing's campaign fire,
 * order's refund settlement/failure, shipping's label purchase composer/
 * pickup reminder — lands on this one topic.
 *
 * `@Public()` + `@SkipThrottle()`: same reason as every other `@EventPattern`
 * controller in this repo — `JwtAuthGuard`/`ThrottlerGuard` are global
 * `APP_GUARD`s that would otherwise reject this non-HTTP execution context.
 */
@Controller()
@Public()
@SkipThrottle()
export class NotifyCommandsController {
  private readonly logger = new Logger(NotifyCommandsController.name);

  constructor(
    private readonly dispatch: DispatchService,
    private readonly config: ConfigService,
  ) {}

  @EventPattern('notify.send')
  async onNotifySend(
    @Payload() payload: Record<string, unknown>,
    @Ctx() envelope: EventEnvelope<Record<string, unknown>>,
  ): Promise<void> {
    // `pickup_reminder` always fans out to two dispatches (in-app + staff
    // email) — handled separately from the single-dispatch mapper below,
    // same "loop over mapped items" shape as `StockLowController`.
    if (payload['template'] === 'pickup_reminder') {
      const staffEmail = this.config.get<string>('NOTIFICATION_STAFF_EMAIL', 'staff@example.com');
      const items = mapPickupReminder(envelope.eventId, payload, staffEmail);
      for (const item of items) {
        await this.dispatch.dispatch({
          storeId: envelope.storeId,
          sourceEventId: item.sourceEventId,
          ...item.input,
        });
      }
      return;
    }

    const mapped = mapNotifyCommand(payload);
    if (mapped.action === 'skip') {
      // Ack + log, never nack-loop on a payload this service doesn't know
      // yet (forward compatibility for purchasing) or a command that
      // legitimately says "don't send" (sendToCustomer===false).
      this.logger.log(
        `notify.send skipped (sourceEventId=${envelope.eventId}, template=${String(payload['template'])}): ${mapped.reason}`,
      );
      return;
    }

    await this.dispatch.dispatch({
      storeId: envelope.storeId,
      sourceEventId: envelope.eventId,
      ...mapped.input,
    });
  }
}
