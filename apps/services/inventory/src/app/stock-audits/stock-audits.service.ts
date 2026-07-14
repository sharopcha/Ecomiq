import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, assertOwnedByStore, paginate, toMinorUnits } from '@temp-nx/typeorm';
import { StockAudit, StockAdjustType } from '../entities/stock-audit.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { StockMovementKind } from '../entities/stock-movement.entity';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CreateStockAuditDto } from './dto/create-stock-audit.dto';
import { FindStockAuditsQueryDto } from './dto/find-stock-audits-query.dto';

/**
 * The Audit Stock modal. `create()` is the one place `stock_audit` rows are
 * written, and it's what actually calls into StockMovementsService.record()
 * for the `quantity` adjust type — this module doesn't touch StockLevel
 * directly, same invariant as every other caller of the ledger.
 */
@Injectable()
export class StockAuditsService {
  constructor(
    @InjectRepository(StockAudit) private readonly repo: Repository<StockAudit>,
    private readonly stockMovements: StockMovementsService,
  ) {}

  /**
   * One transaction: lock the target stock_level (so `availableBefore` can't
   * shift between reading it and applying the resulting movement), save the
   * `stock_audit` row, and — for a `quantity` adjustment with a non-zero
   * discrepancy — pass that same transaction's manager into
   * `StockMovementsService.record()` so the audit row and the ledger/cell
   * mutation either both commit or both roll back together. `record()`
   * re-locks the same row internally; re-acquiring a lock you already hold
   * in the same transaction is a safe no-op in Postgres, not a deadlock risk.
   *
   * A `value` adjustment never calls `record()` at all — it's a monetary
   * write-off/impairment note, not a quantity change (see StockAudit's doc
   * comment for why the DDL only gives it `value_delta_minor`).
   */
  async create(
    storeId: string,
    dto: CreateStockAuditDto,
    actorId: string | null,
  ): Promise<StockAudit> {
    return this.repo.manager.transaction(async (manager) => {
      const stockLevel = await manager
        .createQueryBuilder(StockLevel, 'sl')
        .setLock('pessimistic_write')
        .where('sl.id = :id', { id: dto.stockLevelId })
        .getOne();

      const owned = assertOwnedByStore(
        stockLevel,
        storeId,
        () => new NotFoundException(`Stock level ${dto.stockLevelId} not found`),
      );

      const availableBefore = owned.onHand - owned.reserved;

      if (dto.adjustType === StockAdjustType.Quantity) {
        if (dto.physicalCount === undefined) {
          throw new BadRequestException('physicalCount is required for a quantity adjustment');
        }
        const discrepancy = dto.physicalCount - availableBefore;

        const audit = manager.create(StockAudit, {
          storeId,
          stockLevel: owned,
          adjustType: dto.adjustType,
          physicalCount: dto.physicalCount,
          availableBefore,
          discrepancy,
          valueDeltaMinor: null,
          reason: dto.reason,
          note: dto.note ?? null,
          actorId,
        });
        const saved = await manager.save(audit);

        if (discrepancy !== 0) {
          await this.stockMovements.record(
            {
              storeId,
              stockLevelId: owned.id,
              kind: StockMovementKind.Adjustment,
              qtyDelta: discrepancy,
              refTable: 'stock_audit',
              refId: saved.id,
              actorId,
            },
            manager,
          );
        }

        return saved;
      }

      // adjustType === 'value' — a monetary write-off/impairment note; on_hand/reserved are untouched.
      if (dto.valueDelta === undefined) {
        throw new BadRequestException('valueDelta is required for a value adjustment');
      }
      const audit = manager.create(StockAudit, {
        storeId,
        stockLevel: owned,
        adjustType: dto.adjustType,
        physicalCount: null,
        availableBefore,
        discrepancy: null,
        valueDeltaMinor: toMinorUnits(dto.valueDelta),
        reason: dto.reason,
        note: dto.note ?? null,
        actorId,
      });
      return manager.save(audit);
    });
  }

  /** "Stock adjustment history" right rail. */
  async list(
    storeId: string,
    query: FindStockAuditsQueryDto,
  ): Promise<PaginatedResult<StockAudit>> {
    if (!query.stockLevelId && !query.variantId) {
      throw new BadRequestException('stockLevelId or variantId is required');
    }
    if (
      query.createdFrom &&
      query.createdTo &&
      new Date(query.createdFrom).getTime() > new Date(query.createdTo).getTime()
    ) {
      throw new BadRequestException('createdFrom must not be after createdTo');
    }

    const qb = this.repo
      .createQueryBuilder('a')
      .innerJoin('a.stockLevel', 'sl')
      .where('a.store_id = :storeId', { storeId });

    if (query.stockLevelId) {
      qb.andWhere('sl.id = :stockLevelId', { stockLevelId: query.stockLevelId });
    }
    if (query.variantId) {
      qb.andWhere('sl.variant_id = :variantId', { variantId: query.variantId });
    }
    if (query.createdFrom) {
      qb.andWhere('a.created_at >= :createdFrom', { createdFrom: query.createdFrom });
    }
    if (query.createdTo) {
      qb.andWhere('a.created_at <= :createdTo', { createdTo: query.createdTo });
    }

    return paginate(qb, 'a', query);
  }
}
