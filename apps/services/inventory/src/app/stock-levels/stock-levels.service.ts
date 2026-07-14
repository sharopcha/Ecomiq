import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PaginatedResult, assertOwnedByStore, toMinorUnits } from '@temp-nx/typeorm';
import { StockLevel } from '../entities/stock-level.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
// Not injected as a repository — only referenced as a join target in
// list()'s query builder (`.leftJoin(CatalogProductSnapshot, 'p', ...)`),
// which just needs the entity's metadata (already registered globally via
// data-source.ts), not a repository instance.
import { CatalogProductSnapshot } from '../entities/catalog-product-snapshot.entity';
import { Location } from '../entities/location.entity';
import { CreateStockLevelDto } from './dto/create-stock-level.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { FindStockLevelsQueryDto } from './dto/find-stock-levels-query.dto';
import { StockStatus, computeStockStatus } from './stock-status.util';

const UNIQUE_VIOLATION = '23505';

export interface StockLevelListItem {
  /** stock_level.id when locationId is given (one real row); null when aggregated across locations (no single row to point at — Steps 5+ operate per-location via their own variantId+locationId lookups). */
  id: string | null;
  variantId: string;
  sku: string;
  imageFileId: string | null;
  priceMinor: number | null;
  productId: string | null;
  productName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  onHand: number;
  reserved: number;
  available: number;
  lowThreshold: number | null;
  status: StockStatus;
}

/**
 * The exact same "out/low/high" comparison as computeStockStatus
 * (stock-status.util.ts), expressed as SQL so the `?stockLevel=` filter can
 * be applied *before* pagination (a HAVING clause on the aggregated query) —
 * computing it in JS after the fact would either paginate incorrectly or
 * require fetching every row up front. Keep in sync with computeStockStatus.
 */
const STOCK_STATUS_CASE_SQL = `
  CASE
    WHEN (COALESCE(SUM(sl.on_hand), 0) - COALESCE(SUM(sl.reserved), 0)) <= 0 THEN 'out'
    WHEN SUM(sl.low_threshold) IS NOT NULL
      AND (COALESCE(SUM(sl.on_hand), 0) - COALESCE(SUM(sl.reserved), 0)) <= SUM(sl.low_threshold)
      THEN 'low'
    ELSE 'high'
  END
`;

@Injectable()
export class StockLevelsService {
  constructor(
    @InjectRepository(StockLevel) private readonly repo: Repository<StockLevel>,
    @InjectRepository(CatalogVariantSnapshot)
    private readonly variantRepo: Repository<CatalogVariantSnapshot>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
  ) {}

  /**
   * The Inventory list screen. Rows are one per *variant*, not per
   * variant×location — with `locationId` omitted, on_hand/reserved/threshold
   * are summed across every warehouse (matches the product detail screen's
   * top-level "On hand stock" number, which is a store-wide total with the
   * per-warehouse breakdown shown separately). Passing `locationId` scopes
   * every number to that one warehouse instead.
   *
   * Uses `getRawMany()` rather than the shared `paginate()` helper — that
   * helper assumes entity hydration via `getMany()`, which doesn't apply to
   * a `GROUP BY`/aggregate query. Pagination here follows the same cursor
   * convention by hand (`v.id > :cursor`, order by `v.id ASC`, fetch
   * limit+1, slice, next cursor = last row's variantId).
   */
  async list(
    storeId: string,
    query: FindStockLevelsQueryDto,
  ): Promise<PaginatedResult<StockLevelListItem>> {
    const qb = this.variantRepo
      .createQueryBuilder('v')
      .leftJoin(CatalogProductSnapshot, 'p', 'p.id = v.product_id')
      .leftJoin(
        StockLevel,
        'sl',
        query.locationId
          ? 'sl.variant_id = v.id AND sl.location_id = :locationId'
          : 'sl.variant_id = v.id',
        query.locationId ? { locationId: query.locationId } : {},
      )
      .where('v.store_id = :storeId', { storeId })
      .andWhere('v.deleted_at IS NULL')
      .select('v.id', 'variantId')
      .addSelect('v.sku', 'sku')
      .addSelect('v.image_file_id', 'imageFileId')
      .addSelect('v.price_minor', 'priceMinor')
      .addSelect('p.id', 'productId')
      .addSelect('p.name', 'productName')
      .addSelect('p.category_id', 'categoryId')
      .addSelect('p.category_name', 'categoryName')
      .addSelect('COALESCE(SUM(sl.on_hand), 0)', 'onHand')
      .addSelect('COALESCE(SUM(sl.reserved), 0)', 'reserved')
      .addSelect('SUM(sl.low_threshold)', 'lowThreshold')
      .addSelect(query.locationId ? 'MIN(sl.id)' : 'NULL', 'stockLevelId')
      .groupBy('v.id')
      .addGroupBy('v.sku')
      .addGroupBy('v.image_file_id')
      .addGroupBy('v.price_minor')
      .addGroupBy('p.id')
      .addGroupBy('p.name')
      .addGroupBy('p.category_id')
      .addGroupBy('p.category_name');

    if (query.variantId) {
      qb.andWhere('v.id = :variantId', { variantId: query.variantId });
    }
    if (query.categoryId) {
      qb.andWhere('p.category_id = :categoryId', { categoryId: query.categoryId });
    }
    if (query.search) {
      qb.andWhere('(p.name ILIKE :search OR v.sku ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.stockLevel) {
      qb.having(`${STOCK_STATUS_CASE_SQL} = :stockLevel`, { stockLevel: query.stockLevel });
    }
    if (query.cursor) {
      qb.andWhere('v.id > :cursor', { cursor: query.cursor });
    }

    qb.orderBy('v.id', 'ASC').limit(query.limit + 1);

    const rows = await qb.getRawMany<{
      variantId: string;
      sku: string;
      imageFileId: string | null;
      priceMinor: string | null;
      productId: string | null;
      productName: string | null;
      categoryId: string | null;
      categoryName: string | null;
      onHand: string;
      reserved: string;
      lowThreshold: string | null;
      stockLevelId: string | null;
    }>();

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].variantId : null;

    const items = page.map((row): StockLevelListItem => {
      const onHand = Number(row.onHand);
      const reserved = Number(row.reserved);
      const lowThreshold = row.lowThreshold === null ? null : Number(row.lowThreshold);
      return {
        id: row.stockLevelId,
        variantId: row.variantId,
        sku: row.sku,
        imageFileId: row.imageFileId,
        priceMinor: row.priceMinor === null ? null : Number(row.priceMinor),
        productId: row.productId,
        productName: row.productName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        onHand,
        reserved,
        available: onHand - reserved,
        lowThreshold,
        status: computeStockStatus(onHand - reserved, lowThreshold),
      };
    });

    return { items, nextCursor };
  }

  /**
   * Resolves a gRPC ReserveStock request's `(variant_id, location_id?)`
   * into the `stock_level` row
   * `ReservationsService.create()` actually operates on (it only knows
   * `stockLevelId`, not variant+location). Distinguishes *why* nothing
   * matched — order-service's saga needs to know whether to treat this as
   * "bad variant" vs. "bad/no-stock location", not just a generic failure.
   *
   * No `locationId` given -> picks the location with the most *available*
   * (on_hand - reserved) stock for that variant, ties broken by location id
   * for determinism — a reasonable default when the caller doesn't care
   * which warehouse fulfills the line. This is a location *selection*
   * policy only; it does not itself guarantee enough stock to reserve —
   * that check still happens where it always has, in
   * `StockMovementsService.record()`'s negative-guard.
   */
  async resolveForReservation(
    storeId: string,
    variantId: string,
    locationId?: string,
  ): Promise<
    | { ok: true; stockLevel: StockLevel }
    | { ok: false; reason: 'VARIANT_NOT_FOUND' | 'LOCATION_NOT_FOUND' }
  > {
    const variantCount = await this.variantRepo.count({ where: { id: variantId, storeId } });
    if (variantCount === 0) {
      return { ok: false, reason: 'VARIANT_NOT_FOUND' };
    }

    if (locationId) {
      const stockLevel = await this.repo.findOne({
        where: { storeId, variantId, location: { id: locationId } },
        relations: { location: true },
      });
      if (!stockLevel) return { ok: false, reason: 'LOCATION_NOT_FOUND' };
      return { ok: true, stockLevel };
    }

    const stockLevel = await this.repo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.location', 'location')
      .where('sl.store_id = :storeId', { storeId })
      .andWhere('sl.variant_id = :variantId', { variantId })
      .orderBy('(sl.on_hand - sl.reserved)', 'DESC')
      .addOrderBy('sl.id', 'ASC')
      .getOne();
    // Variant exists (checked above) but has no stock_level row anywhere —
    // same practical outcome as "no location to reserve from".
    if (!stockLevel) return { ok: false, reason: 'LOCATION_NOT_FOUND' };
    return { ok: true, stockLevel };
  }

  /** Raw entity, ownership-checked — used both by a detail HTTP endpoint and internally by Steps 5+ before mutating a cell. */
  async findOne(storeId: string, id: string): Promise<StockLevel> {
    const entity = await this.repo.findOne({ where: { id } });
    return assertOwnedByStore(entity, storeId, () => new NotFoundException(`Stock level ${id} not found`));
  }

  /** Assigns a variant to a location — see CreateStockLevelDto for why onHand isn't settable here. */
  async create(storeId: string, dto: CreateStockLevelDto): Promise<StockLevel> {
    await this.assertVariantOwned(storeId, dto.variantId);
    const location = await this.ownedLocation(storeId, dto.locationId);

    const entity = this.repo.create({
      storeId,
      variantId: dto.variantId,
      location,
      onHand: 0,
      reserved: 0,
      lowThreshold: dto.lowThreshold ?? null,
      unitCostMinor: dto.unitCost !== undefined ? toMinorUnits(dto.unitCost) : null,
    });

    try {
      return await this.repo.save(entity);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(
          `A stock level already exists for variant ${dto.variantId} at location ${dto.locationId}`,
        );
      }
      throw err;
    }
  }

  async update(storeId: string, id: string, dto: UpdateStockLevelDto): Promise<StockLevel> {
    const entity = await this.findOne(storeId, id);
    if (dto.lowThreshold !== undefined) entity.lowThreshold = dto.lowThreshold;
    if (dto.unitCost !== undefined) {
      entity.unitCostMinor = dto.unitCost === null ? null : toMinorUnits(dto.unitCost);
    }
    return this.repo.save(entity);
  }

  /** Blocked while any quantity remains — deleting the cell would silently discard on-hand/reserved stock, so audit/release it first. */
  async remove(storeId: string, id: string): Promise<void> {
    const entity = await this.findOne(storeId, id);
    if (entity.onHand !== 0 || entity.reserved !== 0) {
      throw new ConflictException(
        'Cannot remove a stock level that still has on-hand or reserved quantity — adjust it to zero first',
      );
    }
    await this.repo.remove(entity);
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async assertVariantOwned(storeId: string, variantId: string): Promise<void> {
    const count = await this.variantRepo.count({ where: { id: variantId, storeId } });
    if (count === 0) {
      throw new BadRequestException(`Variant ${variantId} does not belong to this store`);
    }
  }

  private async ownedLocation(storeId: string, locationId: string): Promise<Location> {
    const location = await this.locationRepo.findOneBy({ id: locationId, storeId });
    if (!location) {
      throw new BadRequestException(`Location ${locationId} does not belong to this store`);
    }
    return location;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
