import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { AutoDraftPoService } from './auto-draft-po.service';
import { InventoryEvent, ReorderTriggeredPayload } from './reorder-triggered-payload';

/**
 * Pulsar-facing side of the reorder-triggered consumer — dispatched by the
 * `reorder-triggered::purchasing-service` `PulsarServer` subscription wired
 * in main.ts (inventory-service's own `stock_level` aggregate topic). Same
 * `@Payload()`/`@Ctx()`-required, `@Public()`/`@SkipThrottle()` shape as
 * inventory's own `OrderSyncController`/`PurchasingSyncController` — see
 * their doc comments for the full rationale.
 */
@Controller()
@Public()
@SkipThrottle()
export class AutoDraftPoController {
  constructor(private readonly autoDraft: AutoDraftPoService) {}

  @EventPattern(InventoryEvent.ReorderTriggered)
  async onReorderTriggered(
    @Payload() payload: ReorderTriggeredPayload,
    @Ctx() envelope: EventEnvelope<ReorderTriggeredPayload>,
  ): Promise<void> {
    await this.autoDraft.applyReorderTriggered(envelope.storeId, payload);
  }
}
