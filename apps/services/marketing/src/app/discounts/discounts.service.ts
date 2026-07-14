import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Discount, DiscountStatus } from '../entities/discount.entity';
import { DiscountUsage } from '../entities/discount-usage.entity';
import { DISCOUNT_AGGREGATE_TYPE, MarketingEventType } from '../events/marketing-event-types';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

const UNIQUE_VIOLATION = '23505';

/**
 * `code` is always uppercased/trimmed here before it ever reaches the DB —
 * `UNIQUE(store_id, code)` (the migration) only guards against duplicates
 * once both sides of a comparison are normalized the same way; a caller
 * submitting "save10" and another "SAVE10" must collide, not silently
 * create two rows.
 */
@Injectable()
export class DiscountsService extends TenantScopedCrudService<Discount> {
  protected readonly alias = 'discount';

  constructor(
    @InjectRepository(Discount) repo: Repository<Discount>,
    @InjectRepository(DiscountUsage) private readonly usageRepo: Repository<DiscountUsage>,
  ) {
    super(repo);
  }

  override async create(storeId: string, dto: CreateDiscountDto): Promise<Discount> {
    const discount = this.repo.create({
      ...dto,
      storeId,
      code: this.normalizeCode(dto.code),
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    });

    try {
      return await this.repo.manager.transaction(async (manager) => {
        const saved = await manager.save(discount);
        await recordOutboxEvent(manager, {
          eventType: MarketingEventType.DiscountCreated,
          storeId,
          aggregateType: DISCOUNT_AGGREGATE_TYPE,
          aggregateId: saved.id,
          payload: this.toEventPayload(saved),
        });
        return saved;
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(`Discount code ${discount.code} already exists for this store`);
      }
      throw err;
    }
  }

  override async update(storeId: string, id: string, dto: UpdateDiscountDto): Promise<Discount> {
    const discount = await this.findOne(storeId, id);
    const { code, startsAt, endsAt, ...rest } = dto;

    Object.assign(discount, rest);
    if (code !== undefined) discount.code = this.normalizeCode(code);
    if (startsAt !== undefined) discount.startsAt = startsAt ? new Date(startsAt) : null;
    if (endsAt !== undefined) discount.endsAt = endsAt ? new Date(endsAt) : null;

    try {
      return await this.repo.manager.transaction(async (manager) => {
        const saved = await manager.save(discount);
        await recordOutboxEvent(manager, {
          eventType: MarketingEventType.DiscountUpdated,
          storeId,
          aggregateType: DISCOUNT_AGGREGATE_TYPE,
          aggregateId: saved.id,
          payload: this.toEventPayload(saved),
        });
        return saved;
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(`Discount code ${discount.code} already exists for this store`);
      }
      throw err;
    }
  }

  /** Archived is terminal — no reactivating an archived code. Activating from draft, expired, or already-active is otherwise permissive. */
  async activate(storeId: string, id: string): Promise<Discount> {
    const discount = await this.findOne(storeId, id);
    if (discount.status === DiscountStatus.Archived) {
      throw new ConflictException(`Discount ${id} cannot be activated from status ${discount.status}`);
    }

    discount.status = DiscountStatus.Active;
    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(discount);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.DiscountActivated,
        storeId,
        aggregateType: DISCOUNT_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /** Terminal and idempotent — archiving an already-archived discount is a silent no-op (no duplicate outbox event), unlike activate()'s reverse direction, which is explicitly disallowed. */
  async archive(storeId: string, id: string): Promise<Discount> {
    const discount = await this.findOne(storeId, id);
    if (discount.status === DiscountStatus.Archived) {
      return discount;
    }

    discount.status = DiscountStatus.Archived;
    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(discount);
      await recordOutboxEvent(manager, {
        eventType: MarketingEventType.DiscountArchived,
        storeId,
        aggregateType: DISCOUNT_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /** Store-scoped lookup by the normalized code — used by the `ValidateDiscount` gRPC handler. */
  async findByCode(storeId: string, code: string): Promise<Discount | null> {
    return this.repo.findOneBy({ storeId, code: this.normalizeCode(code) });
  }

  /** How many times this customer has already used this discount — feeds `validate-discount.util.ts`'s `oncePerCustomer` check. */
  async countCustomerUsage(discountId: string, customerId: string): Promise<number> {
    return this.usageRepo.count({ where: { discount: { id: discountId }, customerId } });
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private toEventPayload(discount: Discount): Record<string, unknown> {
    return {
      discountId: discount.id,
      storeId: discount.storeId,
      code: discount.code,
      kind: discount.kind,
      value: discount.value,
      status: discount.status,
      usageLimit: discount.usageLimit,
      usageCount: discount.usageCount,
      oncePerCustomer: discount.oncePerCustomer,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      minSubtotalMinor: discount.minSubtotalMinor,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
