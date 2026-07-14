import { Global, Inject, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Closes the shared client on `app.close()` — without this, the open
 * `ioredis` socket keeps the event loop alive indefinitely after every demo
 * script's own work finishes (found running `shipping:seed`: the script's
 * own logs showed it complete in under a second, but the process never
 * exited because nothing ever called `.quit()`). `OnModuleDestroy` fires as
 * part of `app.close()`'s normal teardown, no `enableShutdownHooks()`
 * needed for that.
 */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}

/**
 * Backs the public tracking page's 60s response cache — same raw-`ioredis`
 * client shape as identity-service's `RedisModule` (no `cache-manager`
 * package precedent exists anywhere in this repo yet, and a single
 * GET/SETEX pair doesn't warrant introducing one). `REDIS_HOST`/
 * `REDIS_PORT_APP`/`REDIS_PASSWORD` are the same generic, un-prefixed env
 * vars every Redis-backed service already reads — one shared Redis
 * instance across services, namespaced by key prefix instead of by port.
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
