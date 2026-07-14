import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Closes the shared client on `app.close()` — without this, the open
 * `ioredis` socket keeps the event loop alive indefinitely after a demo
 * script's own work finishes — crm's `RedisModule` hit this exact bug
 * first (see its own doc comment for the full write-up).
 */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

/**
 * Backs supplier-auth refresh-token rotation/reuse-detection — same
 * `ioredis` client shape as identity/crm's own `RedisModule`s, keyed with a
 * `purchasing:` prefix in `refresh-token.service.ts` (this is a shared
 * Redis instance across services, so keys need to be distinguishable).
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
          password: config.get<string | undefined>('REDIS_PASSWORD', undefined),
          lazyConnect: false,
        }),
      inject: [ConfigService],
    },
    RedisLifecycle,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
