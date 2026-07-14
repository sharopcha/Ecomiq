import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Segment } from '../entities/segment.entity';
import { SegmentMember } from '../entities/segment-member.entity';
import { Customer } from '../entities/customer.entity';
import { CRM_SEGMENT_AGGREGATE_TYPE, SegmentEventType } from '../events/crm-event-types';
import { assertValidSegmentRule, compileSegmentRule } from './segment-rule.util';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';

@Injectable()
export class SegmentsService extends TenantScopedCrudService<Segment> {
  protected readonly alias = 'segment';

  constructor(
    @InjectRepository(Segment) repo: Repository<Segment>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {
    super(repo);
  }

  async create(storeId: string, dto: CreateSegmentDto): Promise<Segment> {
    assertValidSegmentRule(dto.rule);
    return super.create(storeId, { name: dto.name, rule: dto.rule });
  }

  async update(storeId: string, id: string, dto: UpdateSegmentDto): Promise<Segment> {
    if (dto.rule) {
      assertValidSegmentRule(dto.rule);
    }
    return super.update(storeId, id, dto);
  }

  /**
   * Rematerializes `segment_member` from scratch (delete-all-then-insert),
   * stamps `member_count`, and publishes `crm.segment.updated` with
   * `memberCount` + member emails — marketing's own consumer (a later step)
   * needs no sync call back to crm for either. Manual only: no scheduler
   * re-evaluates this on a cadence (automation-service's job, later).
   */
  async evaluate(storeId: string, id: string): Promise<Segment> {
    const segment = await this.repo.findOne({ where: { id, storeId } });
    if (!segment) {
      throw new NotFoundException(`Segment ${id} not found`);
    }

    const { whereClauses, params, needsLoyaltyJoin } = compileSegmentRule(segment.rule);

    const qb = this.customerRepo.createQueryBuilder('customer').where('customer.store_id = :storeId', { storeId });
    if (needsLoyaltyJoin) {
      qb.leftJoin('loyalty_account', 'loyalty_account', 'loyalty_account.customer_id = customer.id');
    }
    for (const clause of whereClauses) {
      qb.andWhere(clause);
    }
    qb.setParameters(params);
    const matches = await qb.select(['customer.id', 'customer.email']).getMany();

    return this.repo.manager.transaction(async (manager) => {
      await manager.delete(SegmentMember, { segmentId: id });
      if (matches.length > 0) {
        await manager
          .createQueryBuilder()
          .insert()
          .into(SegmentMember)
          .values(matches.map((customer) => ({ segmentId: id, customerId: customer.id })))
          .execute();
      }

      segment.memberCount = matches.length;
      const saved = await manager.save(segment);

      await recordOutboxEvent(manager, {
        eventType: SegmentEventType.SegmentUpdated,
        storeId,
        aggregateType: CRM_SEGMENT_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          segmentId: saved.id,
          storeId,
          name: saved.name,
          memberCount: saved.memberCount,
          memberEmails: matches.map((c) => c.email).filter((email): email is string => !!email),
        },
      });

      return saved;
    });
  }
}
