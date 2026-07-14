import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { toMinorUnits } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Product } from '../entities/product.entity';
import { ProductOption } from '../entities/product-option.entity';
import { ProductOptionValue } from '../entities/product-option-value.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { assertProductOwned } from '../products/product-ownership.util';
import { CatalogEventType, CATALOG_AGGREGATE_TYPE } from '../events/catalog-event-types';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import {
  buildVariantSku,
  cartesianProduct,
  combinationKey,
  validateCombinationCoverage,
} from './variant-matrix.util';

const UNIQUE_VIOLATION = '23505';

export interface GenerateMatrixResult {
  created: ProductVariant[];
  skipped: number;
}

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(ProductOptionValue)
    private readonly valueRepo: Repository<ProductOptionValue>,
    @InjectRepository(ProductVariant) private readonly variantRepo: Repository<ProductVariant>,
  ) {}

  async findAll(storeId: string, productId: string): Promise<ProductVariant[]> {
    await assertProductOwned(this.productRepo, storeId, productId);
    return this.variantRepo.find({
      where: { product: { id: productId } },
      relations: { optionValues: true },
      order: { createdAt: 'ASC' },
    });
  }

  async findOne(storeId: string, productId: string, variantId: string): Promise<ProductVariant> {
    return this.findOwnedVariant(storeId, productId, variantId);
  }

  async create(
    storeId: string,
    productId: string,
    dto: CreateProductVariantDto,
  ): Promise<ProductVariant> {
    const product = await assertProductOwned(this.productRepo, storeId, productId);
    const { optionValueIds, price, sku, isDefault, ...rest } = dto;

    const optionValues = await this.validateCombination(productId, optionValueIds);
    await this.assertNoDuplicateCombination(productId, optionValueIds);

    const existingCount = await this.variantRepo.count({ where: { product: { id: productId } } });
    const finalSku = sku ?? buildVariantSku(product.sku, product.id, existingCount + 1);
    const makeDefault = isDefault ?? existingCount === 0;

    return this.variantRepo.manager.transaction(async (manager) => {
      let saved: ProductVariant;
      try {
        const variant = manager.create(ProductVariant, {
          product,
          sku: finalSku,
          priceMinor: price !== undefined ? toMinorUnits(price) : undefined,
          isActive: rest.isActive ?? true,
          isDefault: makeDefault,
          imageFileId: rest.imageFileId,
          optionValues,
        });
        saved = await manager.save(variant);
      } catch (err) {
        throw this.translateUniqueViolation(err);
      }
      if (makeDefault) {
        await this.setAsDefaultTx(manager, productId, saved.id);
        saved.isDefault = true;
      }
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.VariantCreated,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: productId,
        payload: this.toVariantEventPayload(productId, saved),
      });
      return saved;
    });
  }

  async update(
    storeId: string,
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ): Promise<ProductVariant> {
    const variant = await this.findOwnedVariant(storeId, productId, variantId);
    const previousPriceMinor = variant.priceMinor;
    const { optionValueIds, price, isDefault, ...rest } = dto;

    if (optionValueIds !== undefined) {
      const optionValues = await this.validateCombination(productId, optionValueIds);
      await this.assertNoDuplicateCombination(productId, optionValueIds, variant.id);
      variant.optionValues = optionValues;
    }
    Object.assign(variant, rest);
    if (price !== undefined) variant.priceMinor = toMinorUnits(price);
    if (isDefault === false) variant.isDefault = false;

    return this.variantRepo.manager.transaction(async (manager) => {
      let saved: ProductVariant;
      try {
        saved = await manager.save(variant);
      } catch (err) {
        throw this.translateUniqueViolation(err);
      }
      if (isDefault === true) {
        await this.setAsDefaultTx(manager, productId, saved.id);
        saved.isDefault = true;
      }
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.VariantUpdated,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: productId,
        payload: this.toVariantEventPayload(productId, saved),
      });
      if ((saved.priceMinor ?? null) !== (previousPriceMinor ?? null)) {
        await recordOutboxEvent(manager, {
          eventType: CatalogEventType.PriceChanged,
          storeId,
          aggregateType: CATALOG_AGGREGATE_TYPE,
          aggregateId: productId,
          payload: {
            productId,
            variantId: saved.id,
            oldPriceMinor: previousPriceMinor ?? null,
            newPriceMinor: saved.priceMinor ?? null,
          },
        });
      }
      return saved;
    });
  }

  async remove(storeId: string, productId: string, variantId: string): Promise<void> {
    const variant = await this.findOwnedVariant(storeId, productId, variantId);
    const wasDefault = variant.isDefault;
    const removedVariantId = variant.id;

    await this.variantRepo.manager.transaction(async (manager) => {
      await manager.remove(variant);

      // Keep "exactly one default, if any variants remain" true after a
      // delete rather than leaving the product with no default at all.
      if (wasDefault) {
        const next = await manager.findOne(ProductVariant, {
          where: { product: { id: productId } },
          order: { createdAt: 'ASC' },
        });
        if (next) {
          next.isDefault = true;
          await manager.save(next);
        }
      }

      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.VariantDeleted,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: productId,
        payload: { productId, variantId: removedVariantId },
      });
    });
  }

  /**
   * Fills in every option-value combination the product doesn't already have
   * a variant for — the "Variant 1 → Color × SSD Size" matrix from the
   * screenshots. A product with zero options still gets exactly one
   * (option-less) default variant, since every product needs at least one
   * sellable/stockable row.
   */
  async generateMatrix(storeId: string, productId: string): Promise<GenerateMatrixResult> {
    const product = await assertProductOwned(this.productRepo, storeId, productId);
    const options = await this.optionRepo.find({
      where: { product: { id: productId } },
      relations: { values: true },
      order: { position: 'ASC' },
    });

    if (options.length === 0) {
      const existingCount = await this.variantRepo.count({ where: { product: { id: productId } } });
      if (existingCount > 0) return { created: [], skipped: existingCount };

      return this.variantRepo.manager.transaction(async (manager) => {
        const variant = await manager.save(
          manager.create(ProductVariant, {
            product,
            sku: buildVariantSku(product.sku, product.id, 1),
            isActive: true,
            isDefault: true,
            optionValues: [],
          }),
        );
        await recordOutboxEvent(manager, {
          eventType: CatalogEventType.VariantCreated,
          storeId,
          aggregateType: CATALOG_AGGREGATE_TYPE,
          aggregateId: productId,
          payload: this.toVariantEventPayload(productId, variant),
        });
        return { created: [variant], skipped: 0 };
      });
    }

    const valueArrays = options.map((option) =>
      (option.values ?? []).slice().sort((a, b) => a.position - b.position),
    );
    if (valueArrays.some((values) => values.length === 0)) {
      throw new BadRequestException(
        'Every option must have at least one value before generating variants',
      );
    }

    const combinations = cartesianProduct(valueArrays);
    const existing = await this.variantRepo.find({
      where: { product: { id: productId } },
      relations: { optionValues: true },
    });
    const existingKeys = new Set(
      existing.map((v) => combinationKey(v.optionValues?.map((val) => val.id) ?? [])),
    );
    const usedSkus = new Set(existing.map((v) => v.sku));

    return this.variantRepo.manager.transaction(async (manager) => {
      const created: ProductVariant[] = [];
      let counter = existing.length;

      for (const combo of combinations) {
        const key = combinationKey(combo.map((v) => v.id));
        if (existingKeys.has(key)) continue;

        let sku = buildVariantSku(product.sku, product.id, ++counter);
        while (usedSkus.has(sku)) sku = buildVariantSku(product.sku, product.id, ++counter);
        usedSkus.add(sku);

        const variant = manager.create(ProductVariant, {
          product,
          sku,
          isActive: true,
          isDefault: false,
          optionValues: combo,
        });
        created.push(await manager.save(variant));
      }

      if (existing.length === 0 && created.length > 0) {
        await this.setAsDefaultTx(manager, productId, created[0].id);
        created[0].isDefault = true;
      }

      // Emitted after default-assignment above so the very first variant's
      // event reflects its final isDefault value rather than the transient
      // `false` it was created with.
      for (const variant of created) {
        await recordOutboxEvent(manager, {
          eventType: CatalogEventType.VariantCreated,
          storeId,
          aggregateType: CATALOG_AGGREGATE_TYPE,
          aggregateId: productId,
          payload: this.toVariantEventPayload(productId, variant),
        });
      }

      return { created, skipped: combinations.length - created.length };
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async findOwnedVariant(
    storeId: string,
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    await assertProductOwned(this.productRepo, storeId, productId);
    const variant = await this.variantRepo.findOne({
      where: { id: variantId, product: { id: productId } },
      relations: { optionValues: true },
    });
    if (!variant) {
      throw new NotFoundException(`Variant ${variantId} not found on product ${productId}`);
    }
    return variant;
  }

  /**
   * Validates that `optionValueIds` cover exactly one value per one of the
   * product's *current* options (no more, no fewer) and resolves them to
   * real `ProductOptionValue` rows. A product with zero options must pass
   * an empty array. Coverage/shape validation itself is a pure function
   * (variant-matrix.util.ts) — this just fetches the data it needs and
   * translates a failure into the right HTTP exception.
   */
  private async validateCombination(
    productId: string,
    optionValueIds: string[],
  ): Promise<ProductOptionValue[]> {
    const options = await this.optionRepo.find({
      where: { product: { id: productId } },
      relations: { values: true },
    });

    const result = validateCombinationCoverage(
      options.map((o) => ({ id: o.id, values: (o.values ?? []).map((v) => ({ id: v.id })) })),
      optionValueIds,
    );
    if (result.ok === false) {
      throw new BadRequestException(result.reason);
    }

    return optionValueIds.length ? this.valueRepo.findBy({ id: In(optionValueIds) }) : [];
  }

  /** DB-level SKU uniqueness backstops this, but two variants sharing an identical combination is also a logical duplicate worth rejecting explicitly. */
  private async assertNoDuplicateCombination(
    productId: string,
    optionValueIds: string[],
    excludeVariantId?: string,
  ): Promise<void> {
    const key = combinationKey(optionValueIds);
    const existing = await this.variantRepo.find({
      where: { product: { id: productId } },
      relations: { optionValues: true },
    });
    const clash = existing.find(
      (v) =>
        v.id !== excludeVariantId &&
        combinationKey(v.optionValues?.map((val) => val.id) ?? []) === key,
    );
    if (clash) {
      throw new ConflictException('A variant with this exact combination already exists');
    }
  }

  private async setAsDefaultTx(
    manager: EntityManager,
    productId: string,
    variantId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(ProductVariant)
      .set({ isDefault: false })
      .where('product_id = :productId AND id != :variantId', { productId, variantId })
      .execute();
    await manager
      .createQueryBuilder()
      .update(ProductVariant)
      .set({ isDefault: true })
      .where('id = :variantId', { variantId })
      .execute();
  }

  /**
   * aggregateId is always the *product's* id (see catalog-event-types.ts) —
   * variantId lives in the payload.
   *
   * `imageFileId` added 2026-07-06, same reasoning as `categoryName` in
   * products.service.ts's
   * `toProductEventPayload`: inventory-service's Inventory list renders a
   * per-row thumbnail and has no way to look it up post-hoc (no cross-service
   * join), so it needs to ride along in the event rather than requiring a
   * callback. Purely additive.
   */
  private toVariantEventPayload(productId: string, variant: ProductVariant): Record<string, unknown> {
    return {
      productId,
      variantId: variant.id,
      sku: variant.sku,
      priceMinor: variant.priceMinor ?? null,
      isActive: variant.isActive,
      isDefault: variant.isDefault,
      imageFileId: variant.imageFileId ?? null,
      optionValueIds: variant.optionValues?.map((v) => v.id) ?? [],
    };
  }

  private translateUniqueViolation(err: unknown): Error {
    if (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return new ConflictException('A variant with this SKU already exists on this product');
    }
    return err as Error;
  }
}
