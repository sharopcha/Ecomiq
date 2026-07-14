import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Location } from '../entities/location.entity';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

/**
 * Warehouses. Plain tenant-scoped CRUD — unlike stock_level/reservation/etc.,
 * `location` has no Pulsar event of its own (`inventory.stock.*` /
 * `inventory.reservation.*` / `inventory.reorder.triggered` — nothing about
 * locations), so this module never touches the outbox.
 *
 * The one thing worth overriding the generic CRUD for: "at most one default
 * location per store" — same is_default-exclusivity pattern catalog's
 * ProductVariant uses for its own is_default flag (create/update/remove all
 * keep the invariant true). The "Main warehouse" toggle in the screenshots
 * implies a single warehouse acts as the fallback ship-from/receive-to
 * location once more than one exists.
 */
@Injectable()
export class LocationsService extends TenantScopedCrudService<Location> {
  protected readonly alias = 'location';

  constructor(@InjectRepository(Location) repo: Repository<Location>) {
    super(repo);
  }

  override async create(storeId: string, dto: CreateLocationDto): Promise<Location> {
    const existingCount = await this.repo.count({ where: { storeId } });
    // First location for a store is the default automatically, same as a
    // product's first variant — there's no sensible "no default" state once
    // at least one location exists.
    const makeDefault = dto.isDefault ?? existingCount === 0;

    return this.repo.manager.transaction(async (manager) => {
      const entity = manager.create(Location, {
        ...dto,
        storeId,
        isActive: dto.isActive ?? true,
        isDefault: makeDefault,
      });
      const saved = await manager.save(entity);
      if (makeDefault) {
        await this.setAsDefaultTx(manager, storeId, saved.id);
        saved.isDefault = true;
      }
      return saved;
    });
  }

  override async update(storeId: string, id: string, dto: UpdateLocationDto): Promise<Location> {
    const entity = await this.findOne(storeId, id);
    const { isDefault, ...rest } = dto;
    Object.assign(entity, rest);
    if (isDefault === false) entity.isDefault = false;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(entity);
      if (isDefault === true) {
        await this.setAsDefaultTx(manager, storeId, saved.id);
        saved.isDefault = true;
      }
      return saved;
    });
  }

  override async remove(storeId: string, id: string): Promise<void> {
    const entity = await this.findOne(storeId, id);
    const wasDefault = entity.isDefault;

    await this.repo.manager.transaction(async (manager) => {
      await manager.remove(entity);

      // Keep "at most one default, and one if any locations remain" true
      // after a delete, same reasoning as ProductVariant.remove() in
      // catalog-service.
      if (wasDefault) {
        const next = await manager.findOne(Location, {
          where: { storeId },
          order: { createdAt: 'ASC' },
        });
        if (next) {
          next.isDefault = true;
          await manager.save(next);
        }
      }
    });
  }

  private async setAsDefaultTx(
    manager: EntityManager,
    storeId: string,
    locationId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Location)
      .set({ isDefault: false })
      .where('store_id = :storeId AND id != :locationId', { storeId, locationId })
      .execute();
    await manager
      .createQueryBuilder()
      .update(Location)
      .set({ isDefault: true })
      .where('id = :locationId', { locationId })
      .execute();
  }
}
