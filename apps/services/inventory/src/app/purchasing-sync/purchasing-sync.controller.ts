import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { PurchasingSyncService } from './purchasing-sync.service';
import { PoReceivedPayload, PurchasingPoEvent } from './purchasing-event-payloads';

/**
 * Pulsar-facing side of the purchasing-events consumer — dispatched by the
 * `po-events::inventory-service` `PulsarServer` subscription wired in
 * main.ts (purchasing-service's own `purchasing` namespace). Same
 * `@Payload()`/`@Ctx()`-required, `@Public()`/`@SkipThrottle()` shape as
 * `OrderSyncController`/`CatalogSyncController` — see their doc comments
 * for the full rationale.
 */
@Controller()
@Public()
@SkipThrottle()
export class PurchasingSyncController {
  constructor(private readonly sync: PurchasingSyncService) {}

  @EventPattern(PurchasingPoEvent.Received)
  async onPoReceived(
    @Payload() payload: PoReceivedPayload,
    @Ctx() envelope: EventEnvelope<PoReceivedPayload>,
  ): Promise<void> {
    await this.sync.applyPoReceived(envelope.storeId, payload);
  }
}
