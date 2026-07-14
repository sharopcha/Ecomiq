import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedCrudService } from '@temp-nx/typeorm';
import { Popup } from '../entities/popup.entity';

/** Plain CRUD (no transition endpoints for popups — `status` is a regular field set via `update()`). */
@Injectable()
export class PopupsService extends TenantScopedCrudService<Popup> {
  protected readonly alias = 'popup';

  constructor(@InjectRepository(Popup) repo: Repository<Popup>) {
    super(repo);
  }
}
