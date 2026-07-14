import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Discount } from '../entities/discount.entity';
import { DiscountUsage } from '../entities/discount-usage.entity';
import { OrderCanceledPayload, OrderPlacedPayload } from './order-event-payloads';

const UNIQUE_VIOLATION = '23505';

/**
 * Consumes order-service's `orders.order.placed`/`orders.order.canceled`
 * events — the only place `DiscountUsage` rows are ever written. `DiscountsService`/the gRPC
 * `ValidateDiscount` handler are deliberately read-only (see that
 * controller's doc comment) — recording usage here, only once an order
 * has actually been placed, is what keeps a validate-then-abandon
 * checkout from burning a code.
 *
 * Idempotency is the unique `(discount_id, order_id)` index (the
 * migration), not a separate event-id ledger — a duplicate delivery of
 * the same `orders.order.placed` event just hits the constraint and is
 * treated as "already recorded," same spirit as catalog-sync's
 * safe-to-replay upserts, different mechanism (an insert-conflict catch
 * fits this specific write better than an upsert would).
 */
@Injectable()
export class OrderSyncService {
  private readonly logger = new Logger(OrderSyncService.name);

  constructor(
    @InjectRepository(Discount) private readonly discountRepo: Repository<Discount>,
    @InjectRepository(DiscountUsage) private readonly usageRepo: Repository<DiscountUsage>,
  ) {}

  async recordUsage(storeId: string, payload: OrderPlacedPayload): Promise<void> {
    if (!payload.discountId) return; // no discount applied to this order — nothing to do

    const discount = await this.discountRepo.findOneBy({ id: payload.discountId });
    if (!discount) {
      // A discount id that doesn't exist is a genuine data problem, not a
      // transient one — retrying won't fix it. Log and drop rather than
      // throwing (which would nack/redeliver this message forever), same
      // "ack anyway, this is an expected shape of message" reasoning
      // PulsarServer's own no-handler branch uses.
      this.logger.warn(
        `orders.order.placed for order ${payload.orderId} references unknown discount ${payload.discountId} — skipping usage recording`,
      );
      return;
    }

    try {
      await this.discountRepo.manager.transaction(async (manager) => {
        const usage = manager.create(DiscountUsage, {
          storeId,
          discount,
          orderId: payload.orderId,
          customerId: payload.customerId ?? null,
        });
        await manager.save(usage);
        await manager.increment(Discount, { id: discount.id }, 'usageCount', 1);
      });
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;
      // Duplicate delivery of the same placed event — already recorded, no-op.
    }
  }

  async releaseUsage(storeId: string, payload: OrderCanceledPayload): Promise<void> {
    if (!payload.discountId) return;

    await this.discountRepo.manager.transaction(async (manager) => {
      const usage = await manager
        .createQueryBuilder(DiscountUsage, 'du')
        .where('du.store_id = :storeId', { storeId })
        .andWhere('du.order_id = :orderId', { orderId: payload.orderId })
        .andWhere('du.discount_id = :discountId', { discountId: payload.discountId })
        .getOne();

      if (!usage) return; // already released (duplicate cancel delivery), or was never recorded — idempotent no-op

      await manager.remove(usage);
      await manager.decrement(Discount, { id: payload.discountId }, 'usageCount', 1);
    });
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
