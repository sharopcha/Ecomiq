import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TenantScopedCrudService, assertOwnedByStore, toMinorUnits } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Bundle } from '../entities/bundle.entity';
import { BundleItem } from '../entities/bundle-item.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { CatalogEventType, CATALOG_BUNDLE_AGGREGATE_TYPE } from '../events/catalog-event-types';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';
import { BundleItemInput, validateBundleItems } from './bundle-items.util';

@Injectable()
export class BundlesService extends TenantScopedCrudService<Bundle> {
  protected readonly alias = 'bundle';

  constructor(
    @InjectRepository(Bundle) repo: Repository<Bundle>,
    @InjectRepository(BundleItem) private readonly itemRepo: Repository<BundleItem>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
  ) {
    super(repo);
  }

  /** Detail view — full relations (items + the variant each one points at), unlike the list view's base findAll. */
  override async findOne(storeId: string, id: string): Promise<Bundle> {
    const bundle = await this.repo.findOne({
      where: { id },
      relations: { items: { variant: true } },
    });
    return assertOwnedByStore(bundle, storeId, () => new NotFoundException(`Bundle ${id} not found`));
  }

  override async create(storeId: string, dto: CreateBundleDto): Promise<Bundle> {
    const { items, price, ...rest } = dto;

    const validation = validateBundleItems(items);
    if (validation.ok === false) {
      throw new BadRequestException(validation.reason);
    }
    const variants = await this.ownedVariants(storeId, items);

    const bundle = this.repo.create({
      ...rest,
      storeId,
      priceMinor: price !== undefined ? toMinorUnits(price) : undefined,
    });

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(bundle);

      const itemRows = items.map((item) =>
        manager.create(BundleItem, {
          bundle: saved,
          variant: variants.get(item.variantId),
          qty: item.qty,
        }),
      );
      saved.items = await manager.save(itemRows);

      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.BundleCreated,
        storeId,
        aggregateType: CATALOG_BUNDLE_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toBundleEventPayload(saved),
      });

      return saved;
    });
  }

  override async update(storeId: string, id: string, dto: UpdateBundleDto): Promise<Bundle> {
    const bundle = await this.findOne(storeId, id);
    const { items, price, ...rest } = dto;

    Object.assign(bundle, rest);
    if (price !== undefined) bundle.priceMinor = toMinorUnits(price);

    let variants: Map<string, ProductVariant> | undefined;
    if (items !== undefined) {
      const validation = validateBundleItems(items);
      if (validation.ok === false) {
        throw new BadRequestException(validation.reason);
      }
      variants = await this.ownedVariants(storeId, items);
    }

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(bundle);

      // Replace-all semantics — "here is the bundle's contents now," same
      // approach as image reorder, simpler than diffing add/remove/qty-change.
      if (items !== undefined && variants) {
        const existing = await manager.find(BundleItem, { where: { bundle: { id: saved.id } } });
        if (existing.length) {
          await manager.remove(existing);
        }
        const itemRows = items.map((item) =>
          manager.create(BundleItem, {
            bundle: saved,
            variant: variants.get(item.variantId),
            qty: item.qty,
          }),
        );
        saved.items = await manager.save(itemRows);
      }

      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.BundleUpdated,
        storeId,
        aggregateType: CATALOG_BUNDLE_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toBundleEventPayload(saved),
      });

      return saved;
    });
  }

  override async remove(storeId: string, id: string): Promise<void> {
    const bundle = await this.findOne(storeId, id);
    await this.repo.manager.transaction(async (manager) => {
      await manager.remove(bundle);
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.BundleDeleted,
        storeId,
        aggregateType: CATALOG_BUNDLE_AGGREGATE_TYPE,
        aggregateId: bundle.id,
        payload: { bundleId: bundle.id },
      });
    });
  }

  /**
   * Every variantId must belong to *some* product in this store — a variant
   * has no store_id of its own (see ProductVariant's doc comment), so
   * ownership is only knowable by joining through its product, same idea as
   * ProductsService.resolveRefs / ownedManyOrThrow but for variants instead
   * of taxonomy rows.
   */
  private async ownedVariants(
    storeId: string,
    items: BundleItemInput[],
  ): Promise<Map<string, ProductVariant>> {
    const variantIds = items.map((item) => item.variantId);
    const rows = await this.variantRepo.find({
      where: { id: In(variantIds) },
      relations: { product: true },
    });
    const owned = rows.filter((v) => v.product.storeId === storeId);
    if (owned.length !== variantIds.length) {
      throw new BadRequestException('One or more variant ids do not belong to this store');
    }
    return new Map(owned.map((v) => [v.id, v]));
  }

  /** Event-carried-state-transfer snapshot — mirrors ProductsService.toProductEventPayload. */
  private toBundleEventPayload(bundle: Bundle): Record<string, unknown> {
    return {
      bundleId: bundle.id,
      storeId: bundle.storeId,
      name: bundle.name,
      priceMinor: bundle.priceMinor ?? null,
      items: (bundle.items ?? []).map((item) => ({
        variantId: item.variantId,
        qty: item.qty,
      })),
    };
  }
}
