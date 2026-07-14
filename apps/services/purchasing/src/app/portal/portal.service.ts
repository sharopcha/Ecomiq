import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../entities/supplier.entity';
import { PortalUpdateSupplierDto } from './dto/portal-update-supplier.dto';

// A plain data shape, not `Omit<Supplier, 'passwordHash'>` — destructuring
// an entity instance drops its prototype methods (`generateId()` from
// `BaseEntity`), so the result can never structurally satisfy a type built
// from `Omit` (which still requires every other member, methods included).
// `Pick` only requires the fields actually listed, so it's what crm's own
// `StorefrontService.StorefrontProfile` uses — same fix here.
export type SupplierProfile = Pick<
  Supplier,
  | 'id'
  | 'storeId'
  | 'createdAt'
  | 'updatedAt'
  | 'displayId'
  | 'name'
  | 'description'
  | 'phone'
  | 'email'
  | 'website'
  | 'addressLine1'
  | 'city'
  | 'region'
  | 'postalCode'
  | 'countryCode'
  | 'locationLabel'
  | 'shippingCarriers'
  | 'status'
  | 'isFeatured'
  | 'isFavorite'
  | 'ratingAvg'
  | 'ratingCount'
  | 'joinedAt'
  | 'lastLoggedInAt'
  | 'registeredAt'
>;

@Injectable()
export class PortalService {
  constructor(@InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>) {}

  private toProfile(supplier: Supplier): SupplierProfile {
    const { passwordHash: _passwordHash, ...profile } = supplier;
    return profile;
  }

  async getProfile(supplierId: string, storeId: string): Promise<SupplierProfile> {
    const supplier = await this.supplierRepo.findOne({ where: { id: supplierId, storeId } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
    return this.toProfile(supplier);
  }

  async updateProfile(
    supplierId: string,
    storeId: string,
    dto: PortalUpdateSupplierDto,
  ): Promise<SupplierProfile> {
    const supplier = await this.supplierRepo.findOne({ where: { id: supplierId, storeId } });
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }
    this.supplierRepo.merge(supplier, dto);
    const saved = await this.supplierRepo.save(supplier);
    return this.toProfile(saved);
  }
}
