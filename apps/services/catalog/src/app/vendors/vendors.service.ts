import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';

@Injectable()
export class VendorsService extends TenantScopedCrudService<Vendor> {
  protected readonly alias = 'vendor';

  constructor(@InjectRepository(Vendor) repo: Repository<Vendor>) {
    super(repo);
  }
}
