import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EntityManager, Repository } from 'typeorm';
import { ulid } from 'ulid';
import { PaginatedResult, PaginationQueryDto, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { LoyaltyAccount, LoyaltyTier } from '../entities/loyalty-account.entity';
import { LoyaltyTxn, LoyaltyTxnReason } from '../entities/loyalty-txn.entity';
import { CRM_LOYALTY_AGGREGATE_TYPE, LoyaltyEventType } from '../events/crm-event-types';
import { calculateEarnedPoints, tierForPoints } from './loyalty-math.util';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    @InjectRepository(LoyaltyAccount) private readonly accountRepo: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyTxn) private readonly txnRepo: Repository<LoyaltyTxn>,
    private readonly config: ConfigService,
  ) {}

  private tierForCurrentPoints(points: number): LoyaltyTier {
    const gold = Number(this.config.get('CRM_LOYALTY_TIER_GOLD', 2000));
    const silver = Number(this.config.get('CRM_LOYALTY_TIER_SILVER', 500));
    return tierForPoints(points, silver, gold);
  }

  private async getOrCreateAccount(
    manager: EntityManager,
    storeId: string,
    customerId: string,
  ): Promise<LoyaltyAccount> {
    const existing = await manager.findOne(LoyaltyAccount, { where: { storeId, customerId } });
    if (existing) return existing;
    const created = manager.create(LoyaltyAccount, {
      storeId,
      customerId,
      points: 0,
      tier: LoyaltyTier.Bronze,
    });
    return manager.save(created);
  }

  /**
   * `orders.order.placed` handler — `floor(totalMinor / 100) *
   * CRM_LOYALTY_EARN_RATE` points, `reason: 'order'`, `ref_id: orderId`.
   * Idempotency is the partial unique index on `(reason, ref_id)`
   * (`LoyaltyTxn`'s doc comment), not a `processed_event` claim — `ref_id`
   * (the order id) is already a natural idempotency key, so a second
   * `recordOutboxEvent`-free row insert attempt for the same order is
   * simply ignored at the DB level via `ON CONFLICT ... DO NOTHING`.
   */
  async accrueForOrder(storeId: string, customerId: string, orderId: string, totalMinor: number): Promise<void> {
    const earnRate = Number(this.config.get('CRM_LOYALTY_EARN_RATE', 1));
    const points = calculateEarnedPoints(totalMinor, earnRate);
    if (points <= 0) {
      this.logger.log(`loyalty accrual skipped for order ${orderId}: computed points <= 0`);
      return;
    }
    await this.awardWithRefId(storeId, customerId, points, LoyaltyTxnReason.Order, orderId);
  }

  /**
   * Shared by `accrueForOrder` and `ReferralsService.completeIfEligible` —
   * both need "credit points, dedupe via `(reason, ref_id)`, recompute tier,
   * publish" with a real natural key (`orderId`/`referral.id`) to dedupe on.
   * `manualAdjust` doesn't use this: it has no natural key, by design.
   */
  async awardWithRefId(
    storeId: string,
    customerId: string,
    points: number,
    reason: LoyaltyTxnReason,
    refId: string,
  ): Promise<void> {
    await this.accountRepo.manager.transaction(async (manager) => {
      const account = await this.getOrCreateAccount(manager, storeId, customerId);

      const inserted: Array<{ id: string }> = await manager.query(
        `INSERT INTO loyalty_txn (id, store_id, account_id, points_delta, reason, ref_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (reason, ref_id) WHERE ref_id IS NOT NULL DO NOTHING
         RETURNING id`,
        [ulid(), storeId, account.id, points, reason, refId],
      );
      if (inserted.length === 0) {
        this.logger.log(`loyalty award already recorded for (reason=${reason}, refId=${refId}) — no-op`);
        return;
      }

      account.points += points;
      account.tier = this.tierForCurrentPoints(account.points);
      const saved = await manager.save(account);

      await recordOutboxEvent(manager, {
        eventType: LoyaltyEventType.LoyaltyAccrued,
        storeId,
        aggregateType: CRM_LOYALTY_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          accountId: saved.id,
          customerId,
          pointsDelta: points,
          reason,
          refId,
          balance: saved.points,
          tier: saved.tier,
        },
      });
    });
  }

  /** Admin manual adjustment — positive or negative `pointsDelta`, no `ref_id` (no natural key to dedupe on). */
  async manualAdjust(storeId: string, customerId: string, pointsDelta: number, note?: string): Promise<LoyaltyAccount> {
    return this.accountRepo.manager.transaction(async (manager) => {
      const account = await this.getOrCreateAccount(manager, storeId, customerId);

      const txn = manager.create(LoyaltyTxn, {
        storeId,
        accountId: account.id,
        pointsDelta,
        reason: LoyaltyTxnReason.Manual,
        note: note ?? null,
      });
      await manager.save(txn);

      account.points += pointsDelta;
      account.tier = this.tierForCurrentPoints(account.points);
      const saved = await manager.save(account);

      await recordOutboxEvent(manager, {
        eventType: LoyaltyEventType.LoyaltyAccrued,
        storeId,
        aggregateType: CRM_LOYALTY_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          accountId: saved.id,
          customerId,
          pointsDelta,
          reason: LoyaltyTxnReason.Manual,
          refId: null,
          balance: saved.points,
          tier: saved.tier,
        },
      });

      return saved;
    });
  }

  async getAccount(storeId: string, customerId: string): Promise<LoyaltyAccount | null> {
    return this.accountRepo.findOne({ where: { storeId, customerId } });
  }

  async listTxns(storeId: string, customerId: string, query: PaginationQueryDto): Promise<PaginatedResult<LoyaltyTxn>> {
    const account = await this.getAccount(storeId, customerId);
    if (!account) {
      return { items: [], nextCursor: null };
    }
    const qb = this.txnRepo
      .createQueryBuilder('txn')
      .where('txn.store_id = :storeId AND txn.account_id = :accountId', { storeId, accountId: account.id });
    return paginate(qb, 'txn', query);
  }
}
