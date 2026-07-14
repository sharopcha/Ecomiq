import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Membership } from '../entities/membership.entity';
import { Role, permissionsForRole } from '@temp-nx/auth';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly repo: Repository<Membership>,
  ) {}

  create(storeId: string, userId: string, role: Role = 'staff') {
    const membership = this.repo.create({ storeId, userId, role });
    return this.repo.save(membership);
  }

  findOne(storeId: string, userId: string) {
    return this.repo.findOne({ where: { storeId, userId } });
  }

  /** All (store, role) pairs for a user — powers the store switcher + /auth/me. */
  findAllForUser(userId: string) {
    return this.repo.find({ where: { userId }, relations: { store: true } });
  }

  async setRole(storeId: string, userId: string, role: Role) {
    await this.repo.update({ storeId, userId }, { role });
  }

  /** Flattened permission list for the JWT `perms` claim. */
  permsFor(role: Role): string[] {
    return permissionsForRole(role);
  }
}
