import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { PaginatedResult, TenantScopedCrudService, paginate } from '@temp-nx/typeorm';
import { AlertAction, AlertOperator, StockAlert } from '../entities/stock-alert.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { Location } from '../entities/location.entity';
import { CreateStockAlertDto } from './dto/create-stock-alert.dto';
import { UpdateStockAlertDto } from './dto/update-stock-alert.dto';
import { FindStockAlertsQueryDto } from './dto/find-stock-alerts-query.dto';

/**
 * "Create Stock Alert" row action — plain tenant-scoped CRUD (like
 * LocationsService), plus ownership validation on `variantId`/`locationId`
 * (same `ownedOrThrow`-style pattern as StockLevelsService.create). The
 * actual threshold-crossing detection and `inventory.stock.low` publish
 * live in StockMovementsService — this service only manages the
 * subscription rows themselves.
 */
@Injectable()
export class StockAlertsService extends TenantScopedCrudService<StockAlert> {
  protected readonly alias = 'stock_alert';

  constructor(
    @InjectRepository(StockAlert) repo: Repository<StockAlert>,
    @InjectRepository(CatalogVariantSnapshot)
    private readonly variantRepo: Repository<CatalogVariantSnapshot>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
  ) {
    super(repo);
  }

  override async findAll(
    storeId: string,
    query: FindStockAlertsQueryDto,
  ): Promise<PaginatedResult<StockAlert>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });
    if (query.variantId) {
      qb.andWhere(`${this.alias}.variant_id = :variantId`, { variantId: query.variantId });
    }
    return paginate(qb, this.alias, query);
  }

  override async create(storeId: string, dto: CreateStockAlertDto): Promise<StockAlert> {
    await this.assertVariantOwned(storeId, dto.variantId);
    if (dto.locationId) {
      await this.assertLocationOwned(storeId, dto.locationId);
    }

    const entity = this.repo.create({
      storeId,
      variantId: dto.variantId,
      locationId: dto.locationId ?? null,
      threshold: dto.threshold,
      direction: dto.direction ?? AlertOperator.LowerThan,
      actions: dto.actions ?? [AlertAction.SendEmail],
      isActive: dto.isActive ?? true,
    });
    return this.repo.save(entity);
  }

  override async update(storeId: string, id: string, dto: UpdateStockAlertDto): Promise<StockAlert> {
    const entity = await this.findOne(storeId, id);
    if (dto.locationId) {
      await this.assertLocationOwned(storeId, dto.locationId);
    }
    this.repo.merge(entity, dto as DeepPartial<StockAlert>);
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
