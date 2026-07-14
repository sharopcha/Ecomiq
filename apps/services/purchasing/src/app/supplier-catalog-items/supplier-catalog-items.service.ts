import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, paginate } from '@temp-nx/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierCatalogItem } from '../entities/supplier-catalog-item.entity';
import { assertSupplierOwned } from '../suppliers/supplier-ownership.util';
import { CreateSupplierCatalogItemDto } from './dto/create-supplier-catalog-item.dto';
import { UpdateSupplierCatalogItemDto } from './dto/update-supplier-catalog-item.dto';
import { ListSupplierCatalogItemsQueryDto } from './dto/list-supplier-catalog-items-query.dto';

@Injectable()
export class SupplierCatalogItemsService {
  private readonly alias = 'item';

  constructor(
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(SupplierCatalogItem) private readonly itemRepo: Repository<SupplierCatalogItem>,
  ) {}

  async findAll(
    storeId: string,
    supplierId: string,
    query: ListSupplierCatalogItemsQueryDto,
  ): Promise<PaginatedResult<SupplierCatalogItem>> {
    await assertSupplierOwned(this.supplierRepo, storeId, supplierId);
    const qb = this.itemRepo
      .createQueryBuilder(this.alias)
      .where(`${this.alias}.store_id = :storeId AND ${this.alias}.supplier_id = :supplierId`, {
        storeId,
        supplierId,
      });

    if (query.search) {
      qb.andWhere(`(${this.alias}.name ILIKE :search OR ${this.alias}.sku ILIKE :search)`, {
        search: `%${query.search}%`,
      });
    }
    if (query.inStock !== undefined) {
      qb.andWhere(`${this.alias}.in_stock = :inStock`, { inStock: query.inStock });
    }

    return paginate(qb, this.alias, query);
  }

  private async findOwnedItem(
    storeId: string,
    supplierId: string,
    itemId: string,
  ): Promise<SupplierCatalogItem> {
    await assertSupplierOwned(this.supplierRepo, storeId, supplierId);
    const item = await this.itemRepo.findOne({ where: { id: itemId, supplierId, storeId } });
    if (!item) {
      throw new NotFoundException(`Supplier catalog item ${itemId} not found on supplier ${supplierId}`);
    }
    return item;
  }

  async findOne(storeId: string, supplierId: string, itemId: string): Promise<SupplierCatalogItem> {
    return this.findOwnedItem(storeId, supplierId, itemId);
  }

  async create(
    storeId: string,
    supplierId: string,
    dto: CreateSupplierCatalogItemDto,
  ): Promise<SupplierCatalogItem> {
    await assertSupplierOwned(this.supplierRepo, storeId, supplierId);
    const item = this.itemRepo.create({ ...dto, storeId, supplierId });
    return this.itemRepo.save(item);
  }

  async update(
    storeId: string,
    supplierId: string,
    itemId: string,
    dto: UpdateSupplierCatalogItemDto,
  ): Promise<SupplierCatalogItem> {
    const item = await this.findOwnedItem(storeId, supplierId, itemId);
    this.itemRepo.merge(item, dto);
    return this.itemRepo.save(item);
  }

  async remove(storeId: string, supplierId: string, itemId: string): Promise<void> {
    const item = await this.findOwnedItem(storeId, supplierId, itemId);
    await this.itemRepo.remove(item);
  }

  async toggleInStock(storeId: string, supplierId: string, itemId: string): Promise<SupplierCatalogItem> {
    const item = await this.findOwnedItem(storeId, supplierId, itemId);
    item.inStock = !item.inStock;
    return this.itemRepo.save(item);
  }
}
