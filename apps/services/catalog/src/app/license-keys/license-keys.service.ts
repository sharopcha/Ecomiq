import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Product } from '../entities/product.entity';
import { LicenseKey, LicenseKeyStatus } from '../entities/license-key.entity';
import { assertProductOwned } from '../products/product-ownership.util';
import { CatalogEventType, CATALOG_AGGREGATE_TYPE } from '../events/catalog-event-types';
import { AddLicenseKeysDto } from './dto/add-license-keys.dto';
import { ReserveLicenseKeyDto } from './dto/reserve-license-key.dto';
import { FindLicenseKeysQueryDto } from './dto/find-license-keys-query.dto';
import { validateDelete, validateReserve, validateRevoke } from './license-key-status.util';

@Injectable()
export class LicenseKeysService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(LicenseKey) private readonly keyRepo: Repository<LicenseKey>,
  ) {}

  /** A digital product can plausibly have thousands of keys (a batch import), unlike the small bounded collections (options/images) elsewhere — hence pagination here, unlike those. */
  async findAll(
    storeId: string,
    productId: string,
    query: FindLicenseKeysQueryDto,
  ): Promise<PaginatedResult<LicenseKey>> {
    await assertProductOwned(this.productRepo, storeId, productId);

    const qb = this.keyRepo
      .createQueryBuilder('license_key')
      .where('license_key.store_id = :storeId', { storeId })
      .andWhere('license_key.product_id = :productId', { productId });

    if (query.status) {
      qb.andWhere('license_key.status = :status', { status: query.status });
    }

    return paginate(qb, 'license_key', query);
  }

  async addMany(
    storeId: string,
    productId: string,
    dto: AddLicenseKeysDto,
  ): Promise<LicenseKey[]> {
    const product = await assertProductOwned(this.productRepo, storeId, productId);

    return this.keyRepo.manager.transaction(async (manager) => {
      const rows = dto.keyValues.map((keyValue) =>
        manager.create(LicenseKey, {
          storeId,
          product,
          keyValue,
          status: LicenseKeyStatus.Available,
        }),
      );
      const saved = await manager.save(rows);

      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.LicenseKeysAdded,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: productId,
        payload: { productId, count: saved.length },
      });

      return saved;
    });
  }

  /**
   * Atomically hands out the oldest still-Available key for this product —
   * the operation an eventual orders-service checkout flow will call. Row
   * lock (same pattern as ProductsService.nextDisplayNumber) so two
   * concurrent reservations can't both grab the last key.
   */
  async reserveNext(
    storeId: string,
    productId: string,
    dto: ReserveLicenseKeyDto,
  ): Promise<LicenseKey> {
    await assertProductOwned(this.productRepo, storeId, productId);

    return this.keyRepo.manager.transaction(async (manager) => {
      const key = await manager
        .createQueryBuilder(LicenseKey, 'license_key')
        .setLock('pessimistic_write')
        .where('license_key.store_id = :storeId', { storeId })
        .andWhere('license_key.product_id = :productId', { productId })
        .andWhere('license_key.status = :status', { status: LicenseKeyStatus.Available })
        .orderBy('license_key.created_at', 'ASC')
        .limit(1)
        .getOne();

      if (!key) {
        throw new ConflictException(`No available license keys left for product ${productId}`);
      }

      const validation = validateReserve(key.status);
      if (validation.ok === false) {
        // Unreachable given the query above already filters to Available —
        // kept so the throw path stays testable/future-proof if that filter
        // is ever loosened.
        throw new ConflictException(validation.reason);
      }

      key.status = LicenseKeyStatus.Assigned;
      key.orderLineId = dto.orderLineId;
      const saved = await manager.save(key);

      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.LicenseKeyReserved,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: productId,
        payload: { productId, keyId: saved.id, orderLineId: saved.orderLineId ?? null },
      });

      return saved;
    });
  }

  async revoke(storeId: string, productId: string, keyId: string): Promise<LicenseKey> {
    const key = await this.findOwnedKey(storeId, productId, keyId);

    const validation = validateRevoke(key.status);
    if (validation.ok === false) {
      throw new ConflictException(validation.reason);
    }
    key.status = LicenseKeyStatus.Revoked;

    return this.keyRepo.manager.transaction(async (manager) => {
      const saved = await manager.save(key);
      await recordOutboxEvent(manager, {
        eventType: CatalogEventType.LicenseKeyRevoked,
        storeId,
        aggregateType: CATALOG_AGGREGATE_TYPE,
        aggregateId: productId,
        payload: { productId, keyId: saved.id },
      });
      return saved;
    });
  }

  async remove(storeId: string, productId: string, keyId: string): Promise<void> {
    const key = await this.findOwnedKey(storeId, productId, keyId);

    const validation = validateDelete(key.status);
    if (validation.ok === false) {
      throw new ConflictException(validation.reason);
    }
    await this.keyRepo.remove(key);
  }

  private async findOwnedKey(
    storeId: string,
    productId: string,
    keyId: string,
  ): Promise<LicenseKey> {
    await assertProductOwned(this.productRepo, storeId, productId);
    const key = await this.keyRepo.findOne({
      where: { id: keyId, storeId, product: { id: productId } },
    });
    if (!key) {
      throw new NotFoundException(`License key ${keyId} not found`);
    }
    return key;
  }
}
