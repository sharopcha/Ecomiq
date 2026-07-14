import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppUser } from '../entities/app-user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(AppUser) private readonly repo: Repository<AppUser>,
  ) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  /** Same as findByEmail but also selects the (normally hidden) totp_secret column. */
  findByEmailWithSecrets(email: string) {
    return this.repo.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        totpSecret: true,
        totpEnabled: true,
        googleId: true,
      },
    });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  findByIdWithSecrets(id: string) {
    return this.repo.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        totpSecret: true,
        totpEnabled: true,
        googleId: true,
      },
    });
  }

  findByGoogleId(googleId: string) {
    return this.repo.findOne({ where: { googleId } });
  }

  create(data: Partial<AppUser>) {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }

  async linkGoogleId(userId: string, googleId: string) {
    await this.repo.update({ id: userId }, { googleId });
  }

  async setPasswordHash(userId: string, passwordHash: string) {
    await this.repo.update({ id: userId }, { passwordHash });
  }

  async setTotpSecret(userId: string, totpSecret: string | null) {
    await this.repo.update({ id: userId }, { totpSecret });
  }

  async setTotpEnabled(userId: string, enabled: boolean) {
    await this.repo.update({ id: userId }, { totpEnabled: enabled });
  }

  async touchLastLogin(userId: string) {
    await this.repo.update({ id: userId }, { lastLoginAt: new Date() });
  }

  async markEmailVerified(userId: string) {
    await this.repo.update({ id: userId }, { emailVerifiedAt: new Date() });
  }

  async updateProfile(userId: string, data: { fullName: string; countryCode?: string | null; language?: string | null }) {
    await this.repo.update({ id: userId }, data);
  }
}
