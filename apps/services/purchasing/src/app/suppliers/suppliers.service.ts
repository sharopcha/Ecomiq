import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, TenantScopedCrudService } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Supplier, SupplierStatus } from '../entities/supplier.entity';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { writeActivityLog } from '../common/activity-log.util';
import { PURCHASING_SUPPLIER_AGGREGATE_TYPE, SupplierEventType } from '../events/purchasing-event-types';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { ListSuppliersQueryDto, RatingSortDirection } from './dto/list-suppliers-query.dto';

const SUPPLIER_SEQUENCE_KIND = 'supplier';
const SUBJECT_TABLE = 'supplier';

@Injectable()
export class SuppliersService extends TenantScopedCrudService<Supplier> {
  protected readonly alias = 'supplier';

  constructor(@InjectRepository(Supplier) repo: Repository<Supplier>) {
    super(repo);
  }

  private toEventPayload(supplier: Supplier): Record<string, unknown> {
    return {
      id: supplier.id,
      storeId: supplier.storeId,
      displayId: supplier.displayId,
      name: supplier.name,
      email: supplier.email ?? null,
      status: supplier.status,
    };
  }

  async create(storeId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.repo.manager.transaction(async (manager) => {
      const seq = await claimNextSequenceNumber(manager, storeId, SUPPLIER_SEQUENCE_KIND);

      const supplier = manager.create(Supplier, {
        storeId,
        displayId: `SUP-${seq}`,
        name: dto.name,
        description: dto.description ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        website: dto.website ?? null,
        addressLine1: dto.addressLine1 ?? null,
        city: dto.city ?? null,
        region: dto.region ?? null,
        postalCode: dto.postalCode ?? null,
        countryCode: dto.countryCode ?? null,
        locationLabel: dto.locationLabel ?? null,
        shippingCarriers: dto.shippingCarriers ?? null,
        joinedAt: new Date(),
        // Always pass rollup columns explicitly rather than leaving them
        // undefined — MoneyTransformer's analogous crm/customer bug showed
        // an undefined bigint/numeric property forces a NULL insert instead
        // of letting Postgres apply the column DEFAULT.
        ratingCount: 0,
      });
      const saved = await manager.save(supplier);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'supplier.created',
        data: { displayId: saved.displayId, name: saved.name },
      });

      await recordOutboxEvent(manager, {
        eventType: SupplierEventType.SupplierCreated,
        storeId,
        aggregateType: PURCHASING_SUPPLIER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async findAll(storeId: string, query: ListSuppliersQueryDto): Promise<PaginatedResult<Supplier>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });

    if (query.search) {
      qb.andWhere(`(${this.alias}.name ILIKE :search OR ${this.alias}.email ILIKE :search)`, {
        search: `%${query.search}%`,
      });
    }
    if (query.status) {
      qb.andWhere(`${this.alias}.status = :status`, { status: query.status });
    }
    if (query.featured !== undefined) {
      qb.andWhere(`${this.alias}.is_featured = :featured`, { featured: query.featured });
    }
    if (query.favorite !== undefined) {
      qb.andWhere(`${this.alias}.is_favorite = :favorite`, { favorite: query.favorite });
    }

    if (query.cursor) {
      qb.andWhere(`${this.alias}.id > :cursor`, { cursor: query.cursor });
    }
    if (query.sortByRating) {
      qb.orderBy(
        `${this.alias}.rating_avg`,
        query.sortByRating === RatingSortDirection.Asc ? 'ASC' : 'DESC',
        'NULLS LAST',
      );
      qb.addOrderBy(`${this.alias}.id`, 'ASC');
    } else {
      qb.orderBy(`${this.alias}.id`, 'ASC');
    }
    qb.take(query.limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async update(storeId: string, id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    return this.repo.manager.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, { where: { id, storeId } });
      if (!supplier) {
        throw new NotFoundException(`Supplier ${id} not found`);
      }
      manager.merge(Supplier, supplier, dto);
      const saved = await manager.save(supplier);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'supplier.updated',
        data: dto as Record<string, unknown>,
      });

      await recordOutboxEvent(manager, {
        eventType: SupplierEventType.SupplierUpdated,
        storeId,
        aggregateType: PURCHASING_SUPPLIER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  private async setStatus(storeId: string, id: string, status: SupplierStatus): Promise<Supplier> {
    return this.repo.manager.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, { where: { id, storeId } });
      if (!supplier) {
        throw new NotFoundException(`Supplier ${id} not found`);
      }
      supplier.status = status;
      const saved = await manager.save(supplier);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: status === SupplierStatus.Active ? 'supplier.activated' : 'supplier.deactivated',
      });

      await recordOutboxEvent(manager, {
        eventType: SupplierEventType.SupplierUpdated,
        storeId,
        aggregateType: PURCHASING_SUPPLIER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async activate(storeId: string, id: string): Promise<Supplier> {
    return this.setStatus(storeId, id, SupplierStatus.Active);
  }

  async deactivate(storeId: string, id: string): Promise<Supplier> {
    return this.setStatus(storeId, id, SupplierStatus.Inactive);
  }

  private async toggleFlag(
    storeId: string,
    id: string,
    flag: 'isFeatured' | 'isFavorite',
    verb: string,
  ): Promise<Supplier> {
    return this.repo.manager.transaction(async (manager) => {
      const supplier = await manager.findOne(Supplier, { where: { id, storeId } });
      if (!supplier) {
        throw new NotFoundException(`Supplier ${id} not found`);
      }
      supplier[flag] = !supplier[flag];
      const saved = await manager.save(supplier);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb,
        data: { [flag]: saved[flag] },
      });

      await recordOutboxEvent(manager, {
        eventType: SupplierEventType.SupplierUpdated,
        storeId,
        aggregateType: PURCHASING_SUPPLIER_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  async toggleFeature(storeId: string, id: string): Promise<Supplier> {
    return this.toggleFlag(storeId, id, 'isFeatured', 'supplier.feature_toggled');
  }

  async toggleFavorite(storeId: string, id: string): Promise<Supplier> {
    return this.toggleFlag(storeId, id, 'isFavorite', 'supplier.favorite_toggled');
  }
}
