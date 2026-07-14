import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Backs refresh-token rotation/reuse-detection, 2FA setup staging, and
 * password-reset tokens — see ADR-6 (Redis: cache/coordination) and ADR-5
 * (rotating refresh tokens; reuse detection via Redis).
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT_APP', 6379),
          // undefined (dev default, unset env var) means ioredis connects
          // without AUTH, identical to today's
          // behavior; prod sets REDIS_PASSWORD once `redis-server
          // --requirepass` is enabled (docker-compose.prod.yml).
          password: config.get<string | undefined>('REDIS_PASSWORD', undefined),
          lazyConnect: false,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
