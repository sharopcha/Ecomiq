import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Repository } from 'typeorm';
import { PackagePreset } from '../entities/package-preset.entity';

@Injectable()
export class PackagePresetsService extends TenantScopedCrudService<PackagePreset> {
  protected readonly alias = 'package_preset';

  constructor(@InjectRepository(PackagePreset) repo: Repository<PackagePreset>) {
    super(repo);
  }
}
