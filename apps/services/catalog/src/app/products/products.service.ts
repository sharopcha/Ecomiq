import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import {
  PaginatedResult,
  TenantScopedCrudService,
  assertOwnedByStore,
  paginate,
} from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { ProductType } from '../entities/product-type.entity';
import { Vendor } from '../entities/vendor.entity';
import { Channel } from '../entities/channel.entity';
import { Tag } from '../entities/tag.entity';
import { CatalogEventType, CATALOG_AGGREGATE_TYPE } from '../events/catalog-event-types';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { pricingToMinor } from './pricing.util';

/** Postgres error code for `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

interface OwnedRefs {
  category?: Category | null;
  type?: ProductType | null;
  vendor?: Vendor | null;
  channels?: Channel[];
  tags?: Tag[];
}

@Injectable()
export class ProductsService extends TenantScopedCrudService<Product> {
  protected readonly alias = 'product';

  constructor(
    @InjectRepository(Product) repo: Repository<Product>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(ProductType) private readonly typeRepo: Repository<ProductType>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Channel) private readonly channelRepo: Repository<Channel>,
    @InjectRepository(Tag) private readonly tagRepo: Repository<Tag>,
  ) {
    super(repo);
  }

  override async findAll(
    storeId: string,
    query: FindProductsQueryDto,
  ): Promise<PaginatedResult<Product>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .leftJoinAndSelect(`${this.alias}.category`, 'category')
      .leftJoinAndSelect(`${this.alias}.type`, 'type')
      .leftJoinAndSelect(`${this.alias}.vendor`, 'vendor')
      .where(`${this.alias}.store_id = :storeId`, { storeId });

    if (query.status) {
      qb.andWhere(`${this.alias}.status = :status`, { status: query.status });
    }
    if (query.kind) {
      qb.andWhere(`${this.alias}.kind = :kind`, { kind: query.kind });
    }
    if (query.categoryId) {
      qb.andWhere(`${this.alias}.category_id = :categoryId`, {
        categoryId: query.categoryId,
      });
    }
    if (query.vendorId) {
      qb.andWhere(`${this.alias}.vendor_id = :vendorId`, { vendorId: query.vendorId });
    }

    return paginate(qb, this.alias, query);
  }

  /** Detail view — full relations, unlike the list view's scalar-only joins. */
  override async findOne(storeId: string, id: string): Promise<Product> {
    const product = await this.repo.findOne({
      where: { id },
      relations: { category: true, type: true, vendor: true, channels: true, tags: true },
    });
    return assertOwnedByStore(
      product,
      storeId,
      () => new NotFoundException(`Product ${id} not found`),
    );
  }

  override async create(storeId: string, dto: CreateProductDto): Promise<Product> {
    const {
      channelIds,
      tagIds,
      categoryId,
      typeId,
      vendorId,
      price,
      compareAtPrice,
      cost,
      wholesaleMin,
      wholesaleMax,
      ...rest
    } = dto;
    const refs = await this.resolveRefs(storeId, { categoryId, typeId, vendorId, channelIds, tagIds });

    // display_number is a per-store human sequence, not app-generated like the
    // ULID id — assigned atomically (lock the current max row) inside the
    // insert transaction. The only gap this doesn't cover is a brand new
    // store's very first product, where there's no existing row to lock; the
    // one-attempt retry below turns that rare race into a transparent retry
    // instead of a 500, backstopped by the real UNIQUE(store_id, display_number)
    // constraint either way (see also ECOMIQ vault note on `store_sequence`
    // as the eventual proper fix, not built yet).
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.repo.manager.transaction(async (manager) => {
          const displayNumber = await this.nextDisplayNumber(manager, storeId);
          const product = manager.create(Product, {
            ...rest,
            storeId,
            displayNumber,
            ...pricingToMinor({ price, compareAtPrice, cost, wholesaleMin, wholesaleMax }),
            ...refs,
          });
          const saved = await manager.save(product);
          await recordOutboxEvent(manager, {
            eventType: CatalogEventType.ProductCreated,
            storeId,
            aggregateType: CATALOG_AGGREGATE_TYPE,
            aggregateId: saved.id,
            payload: this.toProductEventPayload(saved),
          });
          return saved;
        });
      } catch (err) {
        if (!this.isUniqueViolation(err) || attempt === maxAttempts) throw err;
      }
    }
    /* istanbul ignore next — unreachable, satisfies the compiler's control-flow analysis */
    throw new Error('unreachable');
  }

  override async update(storeId: string, id: string, dto: UpdateProductDto): Promise<Product> {
    const {
      channelIds,
      tagIds,
      categoryId,
      typeId,
      vendorId,
      price,
      compareAtPrice,
      cost,
      wholesaleMin,
      wholesaleMax,
      ...rest
    } = dto;
    const product = await this.findOne(storeId, id); // loads relations we may need to overwrite
    const previousPriceMinor = product.priceMinor;

    const refs = await this.resolveRefs(storeId, { categoryId, typeId, vendorId, channelIds, tagIds });

    Object.assign(product, rest);
    Object.assign(product, pricingToMinor({ price, compareAtPrice, cost, wholesaleMin, wholesaleMax }));
    Object.assign(product, refs);

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(product);
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.ProductUpdated,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toProductEventPayload(saved),
      });
      if ((saved.priceMinor ?? null) !== (previousPriceMinor ?? null)) {
        await recordOutboxEvent(manager, {
          eventType: CatalogEventType.PriceChanged,
          storeId,
          aggregateType: CATALOG_AGGREGATE_TYPE,
          aggregateId: saved.id,
          payload: {
            productId: saved.id,
            variantId: null,
            oldPriceMinor: previousPriceMinor ?? null,
            newPriceMinor: saved.priceMinor ?? null,
          },
        });
      }
      return saved;
    });
  }

  /** Archive = soft delete (`deleted_at`), not a hard row removal — history (order lines, etc.) can still reference the product. */
  override async remove(storeId: string, id: string): Promise<void> {
    const product = await this.findOne(storeId, id);
    await this.repo.manager.transaction(async (manager) => {
      await manager.softRemove(product);
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.ProductArchived,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: product.id,
        payload: { productId: product.id },
      });
    });
  }

  async restore(storeId: string, id: string): Promise<Product> {
    const product = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });
    const owned = assertOwnedByStore(
      product,
      storeId,
      () => new NotFoundException(`Product ${id} not found`),
    );
    await this.repo.manager.transaction(async (manager) => {
      await manager.restore(Product, owned.id);
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.ProductRestored,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: owned.id,
        payload: { productId: owned.id },
      });
    });
    return this.findOne(storeId, id);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  /**
   * Every FK/join here (category/type/vendor/channels/tags) references
   * another tenant-scoped table by bare id — without checking storeId, a
   * client could link a product to another store's category/channel/etc.
   * This resolves each reference against its own repo scoped by storeId, so
   * cross-tenant ids fail loudly (400) instead of silently linking.
   */
  private async resolveRefs(
    storeId: string,
    input: {
      categoryId?: string | null;
      typeId?: string | null;
      vendorId?: string | null;
      channelIds?: string[];
      tagIds?: string[];
    },
  ): Promise<OwnedRefs> {
    const refs: OwnedRefs = {};

    if (input.categoryId !== undefined) {
      refs.category = input.categoryId
        ? await this.ownedOrThrow(this.categoryRepo, storeId, input.categoryId, 'category')
        : null;
    }
    if (input.typeId !== undefined) {
      refs.type = input.typeId
        ? await this.ownedOrThrow(this.typeRepo, storeId, input.typeId, 'product type')
        : null;
    }
    if (input.vendorId !== undefined) {
      refs.vendor = input.vendorId
        ? await this.ownedOrThrow(this.vendorRepo, storeId, input.vendorId, 'vendor')
        : null;
    }
    if (input.channelIds !== undefined) {
      refs.channels = await this.ownedManyOrThrow(
        this.channelRepo,
        storeId,
        input.channelIds,
        'channel',
      );
    }
    if (input.tagIds !== undefined) {
      refs.tags = await this.ownedManyOrThrow(this.tagRepo, storeId, input.tagIds, 'tag');
    }

    return refs;
  }

  private async ownedOrThrow<E extends { id: string; storeId: string }>(
    repo: Repository<E>,
    storeId: string,
    id: string,
    label: string,
  ): Promise<E> {
    const entity = await repo.findOneBy({ id, storeId } as never);
    if (!entity) {
      throw new BadRequestException(`${label} ${id} does not belong to this store`);
    }
    return entity;
  }

  private async ownedManyOrThrow<E extends { id: string; storeId: string }>(
    repo: Repository<E>,
    storeId: string,
    ids: string[],
    label: string,
  ): Promise<E[]> {
    if (ids.length === 0) return [];
    const rows = await repo.findBy({ id: In(ids), storeId } as never);
    if (rows.length !== ids.length) {
      throw new BadRequestException(`One or more ${label} ids do not belong to this store`);
    }
    return rows;
  }

  private async nextDisplayNumber(manager: EntityManager, storeId: string): Promise<number> {
    const last = await manager
      .createQueryBuilder(Product, 'product')
      .withDeleted()
      .setLock('pessimistic_write')
      .where('product.store_id = :storeId', { storeId })
      .orderBy('product.display_number', 'DESC')
      .limit(1)
      .getOne();
    return (last?.displayNumber ?? 0) + 1;
  }

  /**
   * Event-carried-state-transfer snapshot — consumers get enough to act
   * without calling back into catalog-service.
   *
   * `categoryName` is denormalized alongside `categoryId` (2026-07-06) —
   * inventory-service can't join to catalog_db's
   * `category` table (ADR-2, database-per-service) but needs a human-readable
   * category label to render its Inventory list screen, so the name rides
   * along in the event payload rather than requiring a sync callback. Purely
   * additive: existing consumers ignore fields they don't read.
   */
  private toProductEventPayload(product: Product): Record<string, unknown> {
    return {
      productId: product.id,
      storeId: product.storeId,
      displayNumber: product.displayNumber,
      name: product.name,
      status: product.status,
      kind: product.kind,
      sku: product.sku ?? null,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      typeId: product.type?.id ?? null,
      vendorId: product.vendor?.id ?? null,
      priceMinor: product.priceMinor ?? null,
      compareAtMinor: product.compareAtMinor ?? null,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
