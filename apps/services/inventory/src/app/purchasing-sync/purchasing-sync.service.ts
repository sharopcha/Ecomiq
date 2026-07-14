import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { StockLevel } from '../entities/stock-level.entity';
import { Location } from '../entities/location.entity';
import { CatalogVariantSnapshot } from '../entities/catalog-variant-snapshot.entity';
import { StockMovementKind } from '../entities/stock-movement.entity';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { PoReceivedPayload } from './purchasing-event-payloads';

const UNIQUE_VIOLATION = '23505';
const REF_TABLE = 'purchase_order';

/**
 * An additive consumer of purchasing-service's own events — gives
 * `StockMovementKind.PurchaseReceipt` its first real producer (only seed/
 * demo scripts used it before). Zero changes to existing stock-movement
 * logic beyond calling into `StockMovementsService.record()` exactly like
 * every other caller (audit stock, reservations, reorder receipts).
 */
@Injectable()
export class PurchasingSyncService {
  private readonly logger = new Logger(PurchasingSyncService.name);

  constructor(
    @InjectRepository(StockLevel) private readonly stockLevelRepo: Repository<StockLevel>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(CatalogVariantSnapshot)
    private readonly variantRepo: Repository<CatalogVariantSnapshot>,
    private readonly stockMovements: StockMovementsService,
  ) {}

  /**
   * `purchasing.po.received` — for each received line, creates the
   * `stock_level` row if absent (first receipt of a new variant at a
   * location is legal) and records a `purchase_receipt` movement
   * incrementing `on_hand`.
   *
   * Idempotency: `stock_movement.ref_table`/`ref_id` have no unique
   * constraint by default, and this service's existing order-sync precedent
   * (state-based no-op checks, e.g. "is this reservation already committed")
   * doesn't transfer to an *additive* increment — replaying the same event
   * twice would double-count stock with no state to detect it against. So
   * `ref_id = "<poId>:<lineId>:<receivedQty>"` (the line's cumulative total
   * after the triggering call, not that call's own delta) gives every
   * distinct partial receipt its own natural key, backed by a real partial
   * unique index (`stock_movement_po_ref_unique_idx`, `WHERE ref_table =
   * 'purchase_order'` — see the entity/migration). A replayed event's
   * `record()` call fails on that constraint; the whole transaction
   * (including the `on_hand` mutation staged earlier in the same
   * transaction) rolls back atomically, so this is caught and treated as a
   * no-op rather than a crash.
   *
   * Skip-and-logs (never throws) on an unknown `variantId`, a missing/
   * unmatched `deliverToLocationId`, or a line with no `variantId` at all
   * (a free-text PO line was never meant to move real stock) — a malformed
   * or partially-recognized event must not crash this consumer.
   */
  async applyPoReceived(storeId: string, payload: PoReceivedPayload): Promise<void> {
    if (!payload.deliverToLocationId) {
      this.logger.log(`purchasing.po.received skipped: PO ${payload.id} has no deliverToLocationId`);
      return;
    }
    const location = await this.locationRepo.findOneBy({
      id: payload.deliverToLocationId,
      storeId,
    });
    if (!location) {
      this.logger.log(
        `purchasing.po.received skipped: location ${payload.deliverToLocationId} not found in store ${storeId}`,
      );
      return;
    }

    for (const line of payload.lines) {
      if (!line.variantId) {
        this.logger.log(`purchasing.po.received: line ${line.lineId} has no variantId, skipping`);
        continue;
      }
      const variantCount = await this.variantRepo.count({
        where: { id: line.variantId, storeId },
      });
      if (variantCount === 0) {
        this.logger.log(
          `purchasing.po.received: unknown variantId ${line.variantId} (line ${line.lineId}), skipping`,
        );
        continue;
      }

      const refId = `${payload.id}:${line.lineId}:${line.receivedQty}`;
      try {
        await this.stockLevelRepo.manager.transaction(async (manager) => {
          let stockLevel = await manager.findOne(StockLevel, {
            where: { storeId, variantId: line.variantId as string, location: { id: location.id } },
            relations: { location: true },
          });
          if (!stockLevel) {
            stockLevel = await manager.save(
              manager.create(StockLevel, {
                storeId,
                variantId: line.variantId,
                location,
                onHand: 0,
                reserved: 0,
              }),
            );
          }

          await this.stockMovements.record(
            {
              storeId,
              stockLevelId: stockLevel.id,
              kind: StockMovementKind.PurchaseReceipt,
              qtyDelta: line.qty,
              refTable: REF_TABLE,
              refId,
            },
            manager,
          );
        });
      } catch (err) {
        if (this.isUniqueViolation(err)) {
          this.logger.log(`purchasing.po.received already processed (refId=${refId}), skipping`);
          continue;
        }
        throw err;
      }
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
