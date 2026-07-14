import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { PaginatedResult, TenantScopedCrudService, paginate } from '@temp-nx/typeorm';
import { ReorderMethod, ReorderRule } from '../entities/reorder-rule.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { Location } from '../entities/location.entity';
import { CreateReorderRuleDto } from './dto/create-reorder-rule.dto';
import { UpdateReorderRuleDto } from './dto/update-reorder-rule.dto';
import { FindReorderRulesQueryDto } from './dto/find-reorder-rules-query.dto';

/**
 * "Set Automatic Reorder" modal — plain tenant-scoped CRUD (same shape as
 * StockAlertsService), plus ownership validation on `variantId`/
 * `locationId` (both are real in-service entities). `preferredSupplierId`
 * is **not** validated — see ReorderRule's doc comment for why (purchasing-
 * service, which would own it, doesn't exist yet, and never will be a
 * cross-service FK regardless per ADR-2). The actual trigger-level crossing
 * detection and `inventory.reorder.triggered` publish live in
 * StockMovementsService (the same file that also handles stock alerts) —
 * this service only manages the rule rows themselves.
 */
@Injectable()
export class ReorderRulesService extends TenantScopedCrudService<ReorderRule> {
  protected readonly alias = 'reorder_rule';

  constructor(
    @InjectRepository(ReorderRule) repo: Repository<ReorderRule>,
    @InjectRepository(CatalogVariantSnapshot)
    private readonly variantRepo: Repository<CatalogVariantSnapshot>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
  ) {
    super(repo);
  }

  override async findAll(
    storeId: string,
    query: FindReorderRulesQueryDto,
  ): Promise<PaginatedResult<ReorderRule>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });
    if (query.variantId) {
      qb.andWhere(`${this.alias}.variant_id = :variantId`, { variantId: query.variantId });
    }
    return paginate(qb, this.alias, query);
  }

  override async create(storeId: string, dto: CreateReorderRuleDto): Promise<ReorderRule> {
    await this.assertVariantOwned(storeId, dto.variantId);
    if (dto.locationId) {
      await this.assertLocationOwned(storeId, dto.locationId);
    }

    const entity = this.repo.create({
      storeId,
      variantId: dto.variantId,
      locationId: dto.locationId ?? null,
      method: dto.method ?? ReorderMethod.PurchaseOrder,
      triggerLevel: dto.triggerLevel,
      reorderQty: dto.reorderQty,
      preferredSupplierId: dto.preferredSupplierId ?? null,
      leadTimeDays: dto.leadTimeDays ?? null,
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  override async update(
    storeId: string,
    id: string,
    dto: UpdateReorderRuleDto,
  ): Promise<ReorderRule> {
    const entity = await this.findOne(storeId, id);
    if (dto.locationId) {
      await this.assertLocationOwned(storeId, dto.locationId);
    }
    this.repo.merge(entity, dto as DeepPartial<ReorderRule>);
    return this.repo.save(entity);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async assertVariantOwned(storeId: string, variantId: string): Promise<void> {
    const count = await this.variantRepo.count({ where: { id: variantId, storeId } });
    if (count === 0) {
      throw new BadRequestException(`Variant ${variantId} does not belong to this store`);
    }
  }

  private async assertLocationOwned(storeId: string, locationId: string): Promise<void> {
    const count = await this.locationRepo.count({ where: { id: locationId, storeId } });
    if (count === 0) {
      throw new BadRequestException(`Location ${locationId} does not belong to this store`);
    }
  }
}
