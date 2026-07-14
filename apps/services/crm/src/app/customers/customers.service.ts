import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, TenantScopedCrudService } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Customer, CustomerStatus } from '../entities/customer.entity';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { writeActivityLog } from '../common/activity-log.util';
import { claimEventForHandler } from '../common/processed-event.util';
import { CRM_CUSTOMER_AGGREGATE_TYPE, CustomerEventType } from '../events/crm-event-types';
import { OrderPlacedPayload } from '../events/order-placed-event-payload';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';

const CUSTOMER_SEQUENCE_KIND = 'customer';
const SUBJECT_TABLE = 'customer';
const ROLLUP_HANDLER = 'customer_rollup';

@Injectable()
export class CustomersService extends TenantScopedCrudService<Customer> {
  protected readonly alias = 'customer';
  private readonly logger = new Logger(CustomersService.name);

  constructor(@InjectRepository(Customer) repo: Repository<Customer>) {
    super(repo);
  }

  private toEventPayload(customer: Customer): Record<string, unknown> {
    return {
      id: customer.id,
      storeId: customer.storeId,
      displayId: customer.displayId,
      fullName: customer.fullName,
      email: customer.email ?? null,
      status: customer.status,
    };
  }

  async create(storeId: string, dto: CreateCustomerDto): Promise<Customer> {
    return this.repo.manager.transaction(async (manager) => {
      const seq = await claimNextSequenceNumber(manager, storeId, CUSTOMER_SEQUENCE_KIND);

      const customer = manager.create(Customer, {
        storeId,
        displayId: `CST-${seq}`,
        fullName: dto.fullName,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        avatarFileId: dto.avatarFileId ?? null,
        source: dto.source,
        // MoneyTransformer.to() runs even when the property is left
        // undefined, forcing an explicit `NULL` insert instead of letting
        // Postgres apply the column DEFAULT (caught live by
        // crm:customers-demo) — always pass transformed bigint columns
        // explicitly, same as marketing's AdsService.create().
        totalSpentMinor: 0,
      });
      const saved = await manager.save(customer);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'customer.created',
        data: { displayId: saved.displayId, fullName: saved.fullName },
      });

      await recordOutboxEvent(manager, {
        eventType: CustomerEventType.CustomerCreated,
        storeId,
        aggregateType: CRM_CUSTOMER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async findAll(storeId: string, query: ListCustomersQueryDto): Promise<PaginatedResult<Customer>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });

    if (query.search) {
      qb.andWhere(`(${this.alias}.full_name ILIKE :search OR ${this.alias}.email ILIKE :search)`, {
        search: `%${query.search}%`,
      });
    }
    if (query.source) {
      qb.andWhere(`${this.alias}.source = :source`, { source: query.source });
    }
    if (query.status) {
      qb.andWhere(`${this.alias}.status = :status`, { status: query.status });
    }

    if (query.cursor) {
      qb.andWhere(`${this.alias}.id > :cursor`, { cursor: query.cursor });
    }
    qb.orderBy(`${this.alias}.id`, 'ASC').take(query.limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async update(storeId: string, id: string, dto: UpdateCustomerDto): Promise<Customer> {
    return this.repo.manager.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, { where: { id, storeId } });
      if (!customer) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      manager.merge(Customer, customer, dto);
      const saved = await manager.save(customer);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'customer.updated',
        data: dto as Record<string, unknown>,
      });

      await recordOutboxEvent(manager, {
        eventType: CustomerEventType.CustomerUpdated,
        storeId,
        aggregateType: CRM_CUSTOMER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /**
   * `customer` has no `deleted_at` in the data model (unlike
   * TenantScopedSoftDeletableEntity entities) — "archive" is a status
   * transition, not a TypeORM soft-delete.
   */
  async archive(storeId: string, id: string): Promise<Customer> {
    return this.repo.manager.transaction(async (manager) => {
      const customer = await manager.findOne(Customer, { where: { id, storeId } });
      if (!customer) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      customer.status = CustomerStatus.Archived;
      const saved = await manager.save(customer);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'customer.archived',
      });

      await recordOutboxEvent(manager, {
        eventType: CustomerEventType.CustomerUpdated,
        storeId,
        aggregateType: CRM_CUSTOMER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /**
   * `orders.order.placed` handler — upserts the denormalized
   * `total_orders`/`total_spent_minor`/`last_online_at` rollups. Increments
   * aren't naturally replay-safe (unlike shipping's auto-draft exists-check
   * precedent), so this claims `(eventId, ROLLUP_HANDLER)` in the same
   * transaction as the increment — a replayed event is a no-op.
   *
   * If `customerId` is null or doesn't match a known customer, ack-and-skip
   * with a log: orders created before crm-service existed (or for a
   * customer this store never synced) simply stay uncounted.
   *
   * Returns the post-increment `Customer` (or `undefined` if skipped/
   * already-processed) so `OrderEventsController` can hand it straight to
   * `ReferralsService.completeIfEligible` — that check needs to know
   * whether `totalOrders` just transitioned 0->1 *in this same event*, not
   * from a fresh read racing against a concurrent handler.
   */
  async applyOrderRollup(
    storeId: string,
    eventId: string,
    payload: OrderPlacedPayload,
  ): Promise<Customer | undefined> {
    if (!payload.customerId) {
      this.logger.log(
        `orders.order.placed skipped (eventId=${eventId}): order ${payload.orderId} has no customerId`,
      );
      return undefined;
    }

    return this.repo.manager.transaction(async (manager) => {
      const claimed = await claimEventForHandler(manager, eventId, ROLLUP_HANDLER);
      if (!claimed) {
        this.logger.log(`orders.order.placed already processed (eventId=${eventId}, handler=${ROLLUP_HANDLER})`);
        return undefined;
      }

      const customer = await manager.findOne(Customer, {
        where: { id: payload.customerId as string, storeId },
      });
      if (!customer) {
        this.logger.log(
          `orders.order.placed skipped (eventId=${eventId}): customer ${payload.customerId} not found in store ${storeId}`,
        );
        return undefined;
      }

      customer.totalOrders += 1;
      customer.totalSpentMinor += payload.totalMinor;
      customer.lastOnlineAt = new Date();
      return manager.save(customer);
    });
  }
}
