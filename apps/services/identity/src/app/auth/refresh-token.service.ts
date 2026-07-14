import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { ulid } from 'ulid';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

interface RefreshRecord {
  userId: string;
  storeId: string;
  familyId: string;
  rotated?: boolean;
}

const rtKey = (token: string) => `rt:${token}`;
const familyKey = (familyId: string) => `rtfam:${familyId}`;

/**
 * Rotating refresh tokens with reuse detection, per ADR-5: each token is a
 * high-entropy opaque bearer string (never a JWT — nothing to decode, so a
 * leaked Redis dump doesn't leak signing material). `rtfam:<familyId>`
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
    const days = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    this.ttlMs = days * 24 * 60 * 60 * 1000;
  }

  /** Starts a new session (login, or Google login) — returns the raw token to set as an httpOnly cookie. */
  async issue(userId: string, storeId: string): Promise<string> {
    const familyId = ulid();
    const token = randomBytes(40).toString('hex');
    const record: RefreshRecord = { userId, storeId, familyId };
    await this.redis
      .multi()
      .set(rtKey(token), JSON.stringify(record), 'PX', this.ttlMs)
      .set(familyKey(familyId), token, 'PX', this.ttlMs)
      .exec();
    return token;
  }

  /** Validates + rotates a presented refresh token. Throws on invalid/expired/reused. */
  async rotate(
    presentedToken: string,
  ): Promise<{ token: string; userId: string; storeId: string }> {
    const raw = await this.redis.get(rtKey(presentedToken));
    if (!raw) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
    const record: RefreshRecord = JSON.parse(raw);

    if (record.rotated) {
      // Replay of an already-rotated token: treat as compromise, kill the whole session family.
      await this.redis.del(familyKey(record.familyId));
      throw new UnauthorizedException(
        'Refresh token reuse detected — session revoked, please log in again',
      );
    }

    const currentForFamily = await this.redis.get(
      familyKey(record.familyId),
    );
    if (currentForFamily !== presentedToken) {
      // Shouldn't normally happen (would imply rotated flag lost its own key)
      // — fail closed and revoke the family.
      await this.redis.del(familyKey(record.familyId));
      throw new UnauthorizedException('Refresh token session mismatch');
    }

    const newToken = randomBytes(40).toString('hex');
    const newRecord: RefreshRecord = {
      userId: record.userId,
      storeId: record.storeId,
      familyId: record.familyId,
    };

    const pttl = await this.redis.pttl(rtKey(presentedToken));
    await this.redis
      .multi()
      .set(
        rtKey(presentedToken),
        JSON.stringify({ ...record, rotated: true }),
        'KEEPTTL',
      )
      .set(rtKey(newToken), JSON.stringify(newRecord), 'PX', this.ttlMs)
      .set(familyKey(record.familyId), newToken, 'PX', this.ttlMs)
      .exec();
    void pttl; // kept for potential sliding-window tuning later

    return { token: newToken, userId: record.userId, storeId: record.storeId };
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
