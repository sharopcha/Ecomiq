import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Customer } from '../entities/customer.entity';
import { Referral, ReferralStatus } from '../entities/referral.entity';
import { LoyaltyTxnReason } from '../entities/loyalty-txn.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { CRM_LOYALTY_AGGREGATE_TYPE, ReferralEventType } from '../events/crm-event-types';
import { ListReferralsQueryDto } from './dto/list-referrals-query.dto';
import { isReferralCompletionEligible } from './referral-eligibility.util';
import type { ReferralsResponse } from '@temp-nx/api-types/crm';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids ambiguous-looking codes
const MAX_GENERATE_ATTEMPTS = 5;

function randomCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Referral) private readonly referralRepo: Repository<Referral>,
    private readonly loyalty: LoyaltyService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generated lazily on first request, not at customer creation — most
   * admin-created/imported customers never need one. Retries on a unique
   * collision (`(store_id, referral_code)`, partial index) rather than
   * checking-then-inserting, since a check-then-insert has the same race
   * window as any other unique-constraint shortcut in this codebase.
   * Resolves any `pending` referral rows that already named this code
   * before this customer had it assigned (referee registered with a
   * not-yet-existent code) — the one piece of backfill this table needs.
   */
  async getOrCreateCode(storeId: string, customerId: string): Promise<string> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, storeId } });
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }
    if (customer.referralCode) {
      return customer.referralCode;
    }

    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
      const candidate = randomCode();
      try {
        await this.customerRepo.manager.transaction(async (manager) => {
          await manager
            .createQueryBuilder()
            .update(Customer)
            .set({ referralCode: candidate })
            .where('id = :id AND store_id = :storeId', { id: customerId, storeId })
            .execute();

          await manager
            .createQueryBuilder()
            .update(Referral)
            .set({ referrerId: customerId })
            .where('store_id = :storeId AND code = :code AND referrer_id IS NULL AND status = :status', {
              storeId,
              code: candidate,
              status: ReferralStatus.Pending,
            })
            .execute();
        });
        return candidate;
      } catch (err) {
        this.logger.log(`referral code candidate ${candidate} collided, retrying (attempt ${attempt + 1})`);
        if (attempt === MAX_GENERATE_ATTEMPTS - 1) throw err;
      }
    }
    throw new Error('Could not generate a unique referral code');
  }

  async listMine(storeId: string, customerId: string, query: PaginationQueryDto): Promise<ReferralsResponse> {
    const qb = this.referralRepo
      .createQueryBuilder('referral')
      .where('referral.store_id = :storeId AND referral.referrer_id = :customerId', { storeId, customerId });
    // Serialized to ISO strings at the HTTP boundary by Nest's JSON serializer.
    return paginate(qb, 'referral', query) as unknown as Promise<ReferralsResponse>;
  }

  async listAdmin(storeId: string, query: ListReferralsQueryDto): Promise<PaginatedResult<Referral>> {
    const qb = this.referralRepo.createQueryBuilder('referral').where('referral.store_id = :storeId', { storeId });
    if (query.status) {
      qb.andWhere('referral.status = :status', { status: query.status });
    }
    if (query.referrerId) {
      qb.andWhere('referral.referrer_id = :referrerId', { referrerId: query.referrerId });
    }
    if (query.refereeId) {
      qb.andWhere('referral.referee_id = :refereeId', { refereeId: query.refereeId });
    }
    return paginate(qb, 'referral', query);
  }

  /**
   * `orders.order.placed` handler — completes a `pending` referral only on
   * the referee's *first* placed order (`customer.totalOrders === 1`,
   * checked against the value `CustomersService.applyOrderRollup` already
   * returned in the same overall event handling, not a fresh read racing
   * against it). If `referrerId` is still null (the referrer's code hadn't
   * been generated/resolved yet when this referee registered), the
   * referral still completes — the referee held up their end — but no
   * reward can be issued since there's no one to credit.
   */
  async completeIfEligible(storeId: string, customer: Customer, orderId: string): Promise<void> {
    if (!isReferralCompletionEligible(customer.totalOrders)) return;

    const referral = await this.referralRepo.findOne({
      where: { storeId, refereeId: customer.id, status: ReferralStatus.Pending },
    });
    if (!referral) return;

    await this.referralRepo.manager.transaction(async (manager) => {
      referral.status = ReferralStatus.Completed;
      const saved = await manager.save(referral);

      await recordOutboxEvent(manager, {
        eventType: ReferralEventType.ReferralCompleted,
        storeId,
        aggregateType: CRM_LOYALTY_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          referralId: saved.id,
          referrerId: saved.referrerId,
          refereeId: saved.refereeId,
          orderId,
        },
      });
    });

    if (!referral.referrerId) {
      this.logger.log(`referral ${referral.id} completed with no resolved referrer — no reward issued`);
      return;
    }

    const rewardPoints = Number(this.config.get('CRM_REFERRAL_REWARD_POINTS', 500));
    await this.loyalty.awardWithRefId(storeId, referral.referrerId, rewardPoints, LoyaltyTxnReason.Referral, referral.id);
  }
}
