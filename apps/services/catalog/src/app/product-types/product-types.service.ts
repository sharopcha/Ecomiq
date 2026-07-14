import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Repository } from 'typeorm';
import { ProductType } from '../entities/product-type.entity';

@Injectable()
export class ProductTypesService extends TenantScopedCrudService<ProductType> {
  protected readonly alias = 'product_type';

  constructor(@InjectRepository(ProductType) repo: Repository<ProductType>) {
    super(repo);
  }
}
