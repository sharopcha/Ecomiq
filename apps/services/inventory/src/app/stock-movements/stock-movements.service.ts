import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaginatedResult, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { StockMovement, StockMovementKind } from '../entities/stock-movement.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { StockAlert } from '../entities/stock-alert.entity';
import { ReorderRule } from '../entities/reorder-rule.entity';
import { InventoryEventType, STOCK_LEVEL_AGGREGATE_TYPE } from '../events/inventory-event-types';
import { computeStockStatus } from '../stock-levels/stock-status.util';
import { FindStockMovementsQueryDto } from './dto/find-stock-movements-query.dto';
import { targetFieldForKind } from './target-field-for-kind.util';
import { matchesAlert } from './matches-alert.util';

export interface RecordStockMovementInput {
  storeId: string;
  stockLevelId: string;
  kind: StockMovementKind;
  /** Signed — e.g. a sale passes a negative number, a purchase_receipt a positive one. */
  qtyDelta: number;
  refTable?: string | null;
  refId?: string | null;
  actorId?: string | null;
}

/**
 * The one place `stock_level.on_hand`/`.reserved` are ever mutated — the
 * central primitive every other module calls into. Audit stock,
 * reservations, reorder receipts, and any order-service consumer all go
 * through `record()` rather than touching StockLevel directly, so this
 * ledger is always a complete, ordered, atomic history of every change.
 */
@Injectable()
export class StockMovementsService {
  constructor(
    @InjectRepository(StockMovement) private readonly repo: Repository<StockMovement>,
    @InjectRepository(StockLevel) private readonly stockLevelRepo: Repository<StockLevel>,
  ) {}

  /**
   * Atomically: (1) pessimistic-locks the target stock_level row, (2) applies
   * `qtyDelta` to whichever field the kind targets, refusing to let it go
   * negative, (3) inserts the movement row, (4) records the
   * `inventory.stock.adjusted` outbox event — all in one transaction, so a
   * mid-flight failure never leaves the ledger and the cell disagreeing.
   *
   * Accepts an optional `manager` from an *already-open* transaction —
   * audit-stock and reservation/reorder callers that need to save a sibling
   * row (a `stock_audit`, `reservation`, etc.) in the *same* transaction as
   * the movement pass their own manager in rather than letting this method
   * open a second, independent one (which would break atomicity — the
   * sibling row could commit while the stock mutation rolls back, or vice
   * versa). Called with no second argument, it opens its own transaction,
   * exactly as before — existing/standalone callers are unaffected.
   *
   * The lock is scoped to `sl` only (`setLock(..., ['sl'])`) rather than the
   * whole query, since `location` is joined in only to read its id for the
   * event payload — Postgres refuses `FOR UPDATE` on the (structurally
   * always-present, but syntactically outer-joined) far side of a LEFT JOIN,
   * and we have no need to lock `location` itself here anyway.
   */
  async record(input: RecordStockMovementInput, manager?: EntityManager): Promise<StockMovement> {
    if (input.qtyDelta === 0) {
      throw new BadRequestException('qtyDelta must be non-zero');
    }
    if (manager) {
      return this.recordWithManager(manager, input);
    }
    return this.repo.manager.transaction((m) => this.recordWithManager(m, input));
  }

  private async recordWithManager(
    manager: EntityManager,
    input: RecordStockMovementInput,
  ): Promise<StockMovement> {
    const field = targetFieldForKind(input.kind);

    const stockLevel = await manager
      .createQueryBuilder(StockLevel, 'sl')
      .leftJoinAndSelect('sl.location', 'location')
      .setLock('pessimistic_write', undefined, ['sl'])
      .where('sl.id = :id', { id: input.stockLevelId })
      .getOne();

    const owned = assertOwnedByStore(
      stockLevel,
      input.storeId,
      () => new NotFoundException(`Stock level ${input.stockLevelId} not found`),
    );

    const current = owned[field];
    const next = current + input.qtyDelta;
    if (next < 0) {
      throw new ConflictException(
        `Cannot apply ${input.kind} movement: ${field} would go negative (current ${current}, delta ${input.qtyDelta})`,
      );
    }
    // Captured *before* mutating `owned` — the other field is still its
    // pre-movement value at this point, so this is exactly "available as it
    // stood right before this movement," needed for the crossing check below.
    const availableBefore =
      field === 'onHand' ? current - owned.reserved : owned.onHand - current;

    owned[field] = next;
    await manager.save(owned);

    const movement = manager.create(StockMovement, {
      storeId: input.storeId,
      stockLevel: owned,
      kind: input.kind,
      qtyDelta: input.qtyDelta,
      refTable: input.refTable ?? null,
      refId: input.refId ?? null,
      actorId: input.actorId ?? null,
    });
    const saved = await manager.save(movement);

    const available = owned.onHand - owned.reserved;
    await recordOutboxEvent(manager, {
      eventType: InventoryEventType.StockAdjusted,
      storeId: input.storeId,
      aggregateType: STOCK_LEVEL_AGGREGATE_TYPE,
      aggregateId: owned.id,
      payload: {
        stockLevelId: owned.id,
        variantId: owned.variantId,
        locationId: owned.location.id,
        kind: input.kind,
        qtyDelta: input.qtyDelta,
        onHand: owned.onHand,
        reserved: owned.reserved,
        available,
        lowThreshold: owned.lowThreshold ?? null,
        status: computeStockStatus(available, owned.lowThreshold ?? null),
      },
    });

    await this.checkAndPublishLowStockAlerts(manager, owned, availableBefore, available);
    await this.checkAndTriggerReorders(manager, owned, availableBefore, available);

    return saved;
  }

  /**
   * For every active StockAlert watching this cell's variant (and,
   * if the alert has a `locationId`, matching this cell's location too),
   * fires `inventory.stock.low` the moment this movement makes `available`
   * newly satisfy the alert's `direction`/`threshold` — i.e. it didn't match
   * *before* this movement but does *after* it. An alert that already
   * matched before this movement doesn't re-fire on every subsequent
   * movement that keeps it matching; it only fires again once it's cleared
   * and re-crosses.
   *
   * Runs inside the same transaction as the mutation/movement/stock.adjusted
   * event (same `manager`) — a mid-flight failure here rolls back the whole
   * movement too, so the cell, the ledger, and the alert signal never
   * disagree.
   */
  private async checkAndPublishLowStockAlerts(
    manager: EntityManager,
    stockLevel: StockLevel,
    availableBefore: number,
    availableAfter: number,
  ): Promise<void> {
    const alerts = await manager
      .createQueryBuilder(StockAlert, 'alert')
      .where('alert.store_id = :storeId', { storeId: stockLevel.storeId })
      .andWhere('alert.variant_id = :variantId', { variantId: stockLevel.variantId })
      .andWhere('alert.is_active = true')
      .andWhere('(alert.location_id IS NULL OR alert.location_id = :locationId)', {
        locationId: stockLevel.location.id,
      })
      .getMany();

    for (const alert of alerts) {
      const wasMatching = matchesAlert(availableBefore, alert.threshold, alert.direction);
      const isMatching = matchesAlert(availableAfter, alert.threshold, alert.direction);
      if (wasMatching || !isMatching) continue;

      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.StockLow,
        storeId: stockLevel.storeId,
        aggregateType: STOCK_LEVEL_AGGREGATE_TYPE,
        aggregateId: stockLevel.id,
        payload: {
          stockLevelId: stockLevel.id,
          variantId: stockLevel.variantId,
          locationId: stockLevel.location.id,
          alertId: alert.id,
          threshold: alert.threshold,
          direction: alert.direction,
          actions: alert.actions,
          available: availableAfter,
          onHand: stockLevel.onHand,
          reserved: stockLevel.reserved,
          status: computeStockStatus(availableAfter, stockLevel.lowThreshold ?? null),
        },
      });
    }
  }

  /**
   * For every active ReorderRule watching this cell's variant (and,
   * if the rule has a `locationId`, matching this cell's location too),
   * fires `inventory.reorder.triggered` the moment this movement makes
   * `available` newly drop to or below `triggerLevel` — the one fixed
   * comparison ("when on_hand - reserved ≤ trigger_level"), unlike
   * StockAlert's configurable direction. Same
   * "fresh crossing only" gating as `checkAndPublishLowStockAlerts` — a rule
   * that's already at/below trigger_level doesn't re-fire on every
   * subsequent movement that keeps it there, only once it's restocked back
   * above trigger_level and drops again.
   *
   * inventory-service never drafts a purchase order itself — the event
   * payload carries everything (`reorderQty`, `method`,
   * `preferredSupplierId`, `leadTimeDays`) a future purchasing-service needs
   * to do that.
   */
  private async checkAndTriggerReorders(
    manager: EntityManager,
    stockLevel: StockLevel,
    availableBefore: number,
    availableAfter: number,
  ): Promise<void> {
    const rules = await manager
      .createQueryBuilder(ReorderRule, 'rule')
      .where('rule.store_id = :storeId', { storeId: stockLevel.storeId })
      .andWhere('rule.variant_id = :variantId', { variantId: stockLevel.variantId })
      .andWhere('rule.is_active = true')
      .andWhere('(rule.location_id IS NULL OR rule.location_id = :locationId)', {
        locationId: stockLevel.location.id,
      })
      .getMany();

    for (const rule of rules) {
      const wasTriggered = availableBefore <= rule.triggerLevel;
      const isTriggered = availableAfter <= rule.triggerLevel;
      if (wasTriggered || !isTriggered) continue;

      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.ReorderTriggered,
        storeId: stockLevel.storeId,
        aggregateType: STOCK_LEVEL_AGGREGATE_TYPE,
        aggregateId: stockLevel.id,
        payload: {
          stockLevelId: stockLevel.id,
          variantId: stockLevel.variantId,
          locationId: stockLevel.location.id,
          reorderRuleId: rule.id,
          triggerLevel: rule.triggerLevel,
          reorderQty: rule.reorderQty,
          method: rule.method,
          preferredSupplierId: rule.preferredSupplierId ?? null,
          leadTimeDays: rule.leadTimeDays ?? null,
          available: availableAfter,
          onHand: stockLevel.onHand,
          reserved: stockLevel.reserved,
        },
      });
    }
  }

  /**
   * "Stock History" row action on the Inventory list. Scoped by either a
   * single `stockLevelId` (one warehouse) or `variantId` (every warehouse the
   * variant has a cell in, joined through stock_level) — at least one is
   * required so this can't silently return another store's entire ledger.
   */
  async list(
    storeId: string,
    query: FindStockMovementsQueryDto,
  ): Promise<PaginatedResult<StockMovement>> {
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
      .createQueryBuilder('m')
      .innerJoin('m.stockLevel', 'sl')
      .where('m.store_id = :storeId', { storeId });

    if (query.stockLevelId) {
      qb.andWhere('sl.id = :stockLevelId', { stockLevelId: query.stockLevelId });
    }
    if (query.variantId) {
      qb.andWhere('sl.variant_id = :variantId', { variantId: query.variantId });
    }
    if (query.createdFrom) {
      qb.andWhere('m.created_at >= :createdFrom', { createdFrom: query.createdFrom });
    }
    if (query.createdTo) {
      qb.andWhere('m.created_at <= :createdTo', { createdTo: query.createdTo });
    }

    return paginate(qb, 'm', query);
  }
}
