import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { ulid } from 'ulid';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

interface RefreshRecord {
  customerId: string;
  storeId: string;
  familyId: string;
  rotated?: boolean;
}

// `crm:` prefix distinguishes these from identity's own `rt:`/`rtfam:` keys
// in the same shared Redis instance — identity's keys have no service
// prefix at all (safe only because it's Redis's sole consumer today).
const rtKey = (token: string) => `crm:rt:${token}`;
const familyKey = (familyId: string) => `crm:rtfam:${familyId}`;

/**
 * Rotating refresh tokens with reuse detection — copied unchanged from
 * identity-service's `refresh-token.service.ts` (ADR-5): each token is a
 * high-entropy opaque bearer string (never a JWT — nothing to decode, so a
 * leaked Redis dump doesn't leak signing material). `crm:rtfam:<familyId>`
 * always points at the one currently-valid token for that login session;
 * presenting a token that has already been rotated away (`rotated: true`)
 * means it was replayed (stolen) and the whole family is revoked.
 */
@Injectable()
export class RefreshTokenService {
  private readonly ttlMs: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    const days = Number(this.config.get('CRM_REFRESH_TOKEN_TTL_DAYS', 30));
    this.ttlMs = days * 24 * 60 * 60 * 1000;
  }

  /** Starts a new session (register or login) — returns the raw token to set as an httpOnly cookie. */
  async issue(customerId: string, storeId: string): Promise<string> {
    const familyId = ulid();
    const token = randomBytes(40).toString('hex');
    const record: RefreshRecord = { customerId, storeId, familyId };
    await this.redis
      .multi()
      .set(rtKey(token), JSON.stringify(record), 'PX', this.ttlMs)
      .set(familyKey(familyId), token, 'PX', this.ttlMs)
      .exec();
    return token;
  }

  /** Validates + rotates a presented refresh token. Throws on invalid/expired/reused. */
  async rotate(presentedToken: string): Promise<{ token: string; customerId: string; storeId: string }> {
    const raw = await this.redis.get(rtKey(presentedToken));
    if (!raw) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const record: RefreshRecord = JSON.parse(raw);

    if (record.rotated) {
      // Replay of an already-rotated token: treat as compromise, kill the whole session family.
      await this.redis.del(familyKey(record.familyId));
      throw new UnauthorizedException('Refresh token reuse detected — session revoked, please log in again');
    }

    const currentForFamily = await this.redis.get(familyKey(record.familyId));
    if (currentForFamily !== presentedToken) {
      // Shouldn't normally happen (would imply rotated flag lost its own key)
      // — fail closed and revoke the family.
      await this.redis.del(familyKey(record.familyId));
      throw new UnauthorizedException('Refresh token session mismatch');
    }

    const newToken = randomBytes(40).toString('hex');
    const newRecord: RefreshRecord = {
      customerId: record.customerId,
      storeId: record.storeId,
      familyId: record.familyId,
    };

    await this.redis
      .multi()
      .set(rtKey(presentedToken), JSON.stringify({ ...record, rotated: true }), 'KEEPTTL')
      .set(rtKey(newToken), JSON.stringify(newRecord), 'PX', this.ttlMs)
      .set(familyKey(record.familyId), newToken, 'PX', this.ttlMs)
      .exec();

    return { token: newToken, customerId: record.customerId, storeId: record.storeId };
  }

  /** Logout — revokes the current session's whole family (all past + present tokens). */
  async revoke(presentedToken: string): Promise<void> {
    const raw = await this.redis.get(rtKey(presentedToken));
    if (!raw) return;
    const record: RefreshRecord = JSON.parse(raw);
    await this.redis.del(familyKey(record.familyId));
    await this.redis.del(rtKey(presentedToken));
  }
}
