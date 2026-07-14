import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ServiceAccount } from '../entities/service-account.entity';

@Injectable()
export class ServiceAccountsService {
  constructor(
    @InjectRepository(ServiceAccount)
    private readonly repo: Repository<ServiceAccount>,
  ) {}

  /**
   * Looks up `client_id` and checks `client_secret` against the stored
   * bcrypt hash. A single generic 401 either way (unknown client_id, wrong
   * secret, or `is_active: false`) — same "don't tell an attacker which
   * part was wrong" posture as AuthService's login failures.
   */
  async validateCredentials(
    clientId: string,
    clientSecret: string,
  ): Promise<ServiceAccount> {
    const account = await this.repo.findOne({ where: { clientId } });
    if (!account || !account.isActive) {
      throw new UnauthorizedException('Invalid client credentials');
    }
    const ok = await bcrypt.compare(clientSecret, account.secretHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid client credentials');
    }
    return account;
  }

  /**
   * Requesting no scope returns everything the account is allowed; requesting
   * specific scopes returns only the intersection with what's actually
   * granted (never more than `allowedScopes`, silently drops the rest rather
   * than erroring — matches typical OAuth2 client-credentials behavior).
   */
  resolveScopes(account: ServiceAccount, requested?: string[]): string[] {
    if (!requested || requested.length === 0) return account.allowedScopes;
    return requested.filter((s) => account.allowedScopes.includes(s));
  }
}
