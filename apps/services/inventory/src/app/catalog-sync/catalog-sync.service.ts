import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogProductSnapshot } from '../entities/catalog-product-snapshot.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { CatalogProductEventPayload, CatalogVariantEventPayload } from './catalog-event-payloads';

/**
 * Applies catalog-service's product/variant events to the local read-model
 * snapshot tables (CatalogSyncController is the Pulsar-facing side; this is
 * the DB-facing side). Every handler is an upsert by design — Pulsar
 * delivery is at-least-once and a negatively-acknowledged message gets
 * redelivered (see PulsarServer.handleMessage), so handling the same event
 * twice must be a safe no-op, not a duplicate-key error.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  constructor(
    @InjectRepository(CatalogProductSnapshot)
    private readonly productRepo: Repository<CatalogProductSnapshot>,
    @InjectRepository(CatalogVariantSnapshot)
    private readonly variantRepo: Repository<CatalogVariantSnapshot>,
  ) {}

  async upsertProduct(storeId: string, payload: CatalogProductEventPayload): Promise<void> {
    const entity =
      (await this.productRepo.findOne({ where: { id: payload.productId } })) ??
      this.productRepo.create({ id: payload.productId });

    entity.storeId = storeId;
    entity.displayNumber = payload.displayNumber;
    entity.name = payload.name;
    entity.sku = payload.sku;
    entity.status = payload.status;
    entity.kind = payload.kind;
    entity.categoryId = payload.categoryId;
    entity.categoryName = payload.categoryName;
    entity.priceMinor = payload.priceMinor;
    entity.compareAtMinor = payload.compareAtMinor;
    // A product.updated for an already-archived product shouldn't happen in
    // practice (catalog's own API rejects writes to soft-deleted rows), but
    // if it ever does, don't let a stale archivedAt linger past a fresher
    // created/updated event.
    entity.archivedAt = null;

    await this.productRepo.save(entity);
    this.logger.debug(`upserted product snapshot ${payload.productId}`);
  }

  async archiveProduct(storeId: string, productId: string, occurredAt: Date): Promise<void> {
    const entity =
      (await this.productRepo.findOne({ where: { id: productId } })) ??
      (await this.placeholderProduct(storeId, productId));

    entity.status = 'archived';
    entity.archivedAt = occurredAt;
    await this.productRepo.save(entity);
  }

  async restoreProduct(productId: string): Promise<void> {
    const entity = await this.productRepo.findOne({ where: { id: productId } });
    if (!entity) return; // nothing to restore locally — a later product.updated will backfill it if this snapshot ever missed the create
    entity.archivedAt = null;
    await this.productRepo.save(entity);
  }

  async upsertVariant(storeId: string, payload: CatalogVariantEventPayload): Promise<void> {
    await this.ensureProductPlaceholder(storeId, payload.productId);

    const entity =
      (await this.variantRepo.findOne({ where: { id: payload.variantId } })) ??
      this.variantRepo.create({ id: payload.variantId });

    entity.storeId = storeId;
    entity.productId = payload.productId;
    entity.sku = payload.sku;
    entity.priceMinor = payload.priceMinor;
    entity.isActive = payload.isActive;
    entity.isDefault = payload.isDefault;
    entity.imageFileId = payload.imageFileId;
    entity.deletedAt = null;

    await this.variantRepo.save(entity);
  }

  async deleteVariant(variantId: string, occurredAt: Date): Promise<void> {
    const entity = await this.variantRepo.findOne({ where: { id: variantId } });
    if (!entity) return;
    entity.deletedAt = occurredAt;
    await this.variantRepo.save(entity);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /**
   * Defensive backstop for out-of-order delivery: a variant event referencing
   * a product this consumer hasn't recorded yet (e.g. this subscription was
   * created after some retained history had already expired) gets a minimal
   * placeholder product row instead of failing outright. The eventual
   * catalog.product.created/updated for that id fills it in properly; until
   * then the placeholder just has empty display fields.
   */
  private async ensureProductPlaceholder(storeId: string, productId: string): Promise<void> {
    const count = await this.productRepo.count({ where: { id: productId } });
    if (count > 0) return;
    await this.placeholderProduct(storeId, productId);
  }

  private async placeholderProduct(
    storeId: string,
    productId: string,
  ): Promise<CatalogProductSnapshot> {
    this.logger.warn(
      `no local snapshot for product ${productId} yet — creating a placeholder row`,
    );
    return this.productRepo.save(
      this.productRepo.create({
        id: productId,
        storeId,
        name: '',
        status: 'unknown',
      }),
    );
  }
}
