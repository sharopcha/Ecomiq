import { NotFoundException } from '@nestjs/common';
import { DeepPartial, Repository } from 'typeorm';
import { PaginatedResult, PaginationQueryDto, paginate } from './pagination';
import { assertOwnedByStore } from './tenant-scope';

/**
 * Generic create/list/get/update/remove for any `TenantScopedEntity`-based
 * resource. Every taxonomy table (vendor, category, product_type_lu,
 * channel, tag) needs the exact same "scope to store, paginate by id,
 * 404-if-wrong-store" logic — this collapses that into one place instead of
 * hand-rolling it five times, without reaching for codegen/Nx generators.
 *
 * Subclasses stay tiny:
 *
 *   @Injectable()
 *   export class VendorsService extends TenantScopedCrudService<Vendor> {
 *     protected readonly alias = 'vendor';
 *     constructor(@InjectRepository(Vendor) repo: Repository<Vendor>) { super(repo); }
 *   }
 *
 * and can add resource-specific methods (e.g. Category.findChildren) on top.
 */
export abstract class TenantScopedCrudService<
  T extends { id: string; storeId: string },
> {
  /** Query-builder alias, e.g. 'vendor' — must match the entity's table/property naming. */
  protected abstract readonly alias: string;

  protected constructor(protected readonly repo: Repository<T>) {}

  async create(storeId: string, data: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create({ ...data, storeId } as DeepPartial<T>);
    return this.repo.save(entity);
  }

  async findAll(
    storeId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<T>> {
    const qb = this.repo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId`, { storeId });
    return paginate(qb, this.alias, query);
  }

  async findOne(storeId: string, id: string): Promise<T> {
    const entity = await this.repo.findOne({ where: { id } as never });
    return assertOwnedByStore(
      entity as (T & { storeId: string }) | null,
      storeId,
      () => new NotFoundException(`${this.alias} ${id} not found`),
    );
  }

  async update(storeId: string, id: string, data: DeepPartial<T>): Promise<T> {
    const entity = await this.findOne(storeId, id);
    this.repo.merge(entity, data as DeepPartial<T>);
    return this.repo.save(entity);
  }

  async remove(storeId: string, id: string): Promise<void> {
    const entity = await this.findOne(storeId, id);
    await this.repo.remove(entity);
  }
}
