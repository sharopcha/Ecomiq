import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload } from '@nestjs/microservices';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '@temp-nx/auth';
import type { EventEnvelope } from '@temp-nx/pulsar';
import { CatalogSyncService } from './catalog-sync.service';
import {
  CatalogProductArchivedPayload,
  CatalogProductEvent,
  CatalogProductEventPayload,
  CatalogProductRestoredPayload,
  CatalogVariantDeletedPayload,
  CatalogVariantEvent,
  CatalogVariantEventPayload,
} from './catalog-event-payloads';

/**
 * Pulsar-facing side of the catalog variant snapshot consumer. No
 * HTTP routes — every method here is an `@EventPattern` handler dispatched
 * by `PulsarServer` (see pulsar.server.ts: `getHandlerByPattern(envelope.eventType)`,
 * invoked as `handler(envelope.payload, envelope)`), wired up in main.ts via
 * `app.connectMicroservice({ strategy: new PulsarServer({ aggregates: ['product'], ... }) })`.
 *
 * `@Payload()`/`@Ctx()` on every handler param below are required, not
 * decorative — Nest's `ExternalContextCreator` resolves microservice handler
 * arguments by decorator metadata, not by forwarding `PulsarServer`'s raw
 * `handler(payload, envelope)` call positionally. Without them, `envelope`
 * arrives as `undefined` and every handler that reads `envelope.storeId`
 * throws (reproduced live: `catalog.product.created`/`.updated` failed on
 * every message with "Cannot read properties of undefined (reading
 * 'storeId')" until this was added).
 *
 * `@Public()` + `@SkipThrottle()`: this controller never goes through
 * NestJS's HTTP layer, but `JwtAuthGuard`/`ThrottlerGuard` are registered as
 * *global* `APP_GUARD`s in app.module.ts and Nest runs global guards for
 * every execution context, HTTP or not. `JwtAuthGuard` would otherwise call
 * `context.switchToHttp().getRequest()` here and blow up on `undefined` for
 * an RPC context — `@Public()` short-circuits it via handler/class metadata
 * (context-agnostic, no request object touched) before that ever happens.
 * `@SkipThrottle()` sidesteps the same class of risk on the throttler side.
 */
@Controller()
@Public()
@SkipThrottle()
export class CatalogSyncController {
  constructor(private readonly sync: CatalogSyncService) {}

  @EventPattern(CatalogProductEvent.Created)
  async onProductCreated(
    @Payload() payload: CatalogProductEventPayload,
    @Ctx() envelope: EventEnvelope<CatalogProductEventPayload>,
  ): Promise<void> {
    await this.sync.upsertProduct(envelope.storeId, payload);
  }

  @EventPattern(CatalogProductEvent.Updated)
  async onProductUpdated(
    @Payload() payload: CatalogProductEventPayload,
    @Ctx() envelope: EventEnvelope<CatalogProductEventPayload>,
  ): Promise<void> {
    await this.sync.upsertProduct(envelope.storeId, payload);
  }

  @EventPattern(CatalogProductEvent.Archived)
  async onProductArchived(
    @Payload() payload: CatalogProductArchivedPayload,
    @Ctx() envelope: EventEnvelope<CatalogProductArchivedPayload>,
  ): Promise<void> {
    await this.sync.archiveProduct(
      envelope.storeId,
      payload.productId,
      new Date(envelope.occurredAt),
    );
  }

  @EventPattern(CatalogProductEvent.Restored)
  async onProductRestored(@Payload() payload: CatalogProductRestoredPayload): Promise<void> {
    await this.sync.restoreProduct(payload.productId);
  }

  @EventPattern(CatalogVariantEvent.Created)
  async onVariantCreated(
    @Payload() payload: CatalogVariantEventPayload,
    @Ctx() envelope: EventEnvelope<CatalogVariantEventPayload>,
  ): Promise<void> {
    await this.sync.upsertVariant(envelope.storeId, payload);
  }

  @EventPattern(CatalogVariantEvent.Updated)
  async onVariantUpdated(
    @Payload() payload: CatalogVariantEventPayload,
    @Ctx() envelope: EventEnvelope<CatalogVariantEventPayload>,
  ): Promise<void> {
    await this.sync.upsertVariant(envelope.storeId, payload);
  }

  @EventPattern(CatalogVariantEvent.Deleted)
  async onVariantDeleted(
    @Payload() payload: CatalogVariantDeletedPayload,
    @Ctx() envelope: EventEnvelope<CatalogVariantDeletedPayload>,
  ): Promise<void> {
    await this.sync.deleteVariant(payload.variantId, new Date(envelope.occurredAt));
  }
}
