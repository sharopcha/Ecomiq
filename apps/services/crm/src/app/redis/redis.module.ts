import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Closes the shared client on `app.close()` — without this, the open
 * `ioredis` socket keeps the event loop alive indefinitely after a demo
 * script's own work finishes (found running `crm:customer-auth-demo`: all
 * assertions passed and logged in under a second, but the process never
 * exited because nothing ever called `.quit()` — shipping-service's own
 * `RedisModule` hit this exact bug first). `OnModuleDestroy` fires as part
 * of `app.close()`'s normal teardown, no `enableShutdownHooks()` needed.
 */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

/**
 * Backs customer-auth refresh-token rotation/reuse-detection — same
 * `ioredis` client shape as identity-service's own `RedisModule`, but keyed
 * with a `crm:` prefix in `refresh-token.service.ts` (identity's own keys
 * have no service prefix at all, safe only because identity is the sole
 * consumer of its own Redis instance; crm shares the same Redis, so its
 * keys need to be distinguishable).
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
