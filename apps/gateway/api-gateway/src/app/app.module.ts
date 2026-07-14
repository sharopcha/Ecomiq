import { Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard } from '@temp-nx/auth';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthProxyModule } from './auth-proxy/auth-proxy.module';
import { CatalogProxyModule } from './catalog-proxy/catalog-proxy.module';
import { InventoryProxyModule } from './inventory-proxy/inventory-proxy.module';
import { OrderProxyModule } from './order-proxy/order-proxy.module';
import { PaymentProxyModule } from './payment-proxy/payment-proxy.module';
import { MarketingProxyModule } from './marketing-proxy/marketing-proxy.module';
import { NotificationProxyModule } from './notification-proxy/notification-proxy.module';
import { ShippingProxyModule } from './shipping-proxy/shipping-proxy.module';
import { CrmProxyModule } from './crm-proxy/crm-proxy.module';
import { PurchasingProxyModule } from './purchasing-proxy/purchasing-proxy.module';
import { MediaProxyModule } from './media-proxy/media-proxy.module';
import { HealthModule } from './health/health.module';
import { MarketsProxyModule } from './markets-proxy/markets-proxy.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Redis-backed storage so rate-limit
    // counters are shared across gateway replicas and survive a restart
    // (previously in-memory, per the removed TODO here). `REDIS_URL`
    // defaults to local dev; docker-compose.yml sets it to
    // redis://redis:6379 (the `redis` service already exists there). If
    // Redis is unreachable this logs loudly rather than silently falling
    // back to per-instance memory — same hard dependency identity-service
    // already has on Redis (see its redis.module.ts).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');
        const redis = new Redis(redisUrl);
        redis.on('error', (err) => {
          Logger.error(
            `Redis throttler storage connection error: ${err.message}`,
            err.stack,
            'ThrottlerStorage',
          );
        });
        return {
          // Public-facing default; auth endpoints get a tighter limit via
          // @Throttle() overrides once brute-force testing informs the numbers.
          throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
          storage: new ThrottlerStorageRedisService(redis),
        };
      },
    }),
    AuthSharedModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        jwksUri: config.get<string>(
          'JWKS_URI',
          'http://localhost:3001/api/.well-known/jwks.json',
        ),
        issuer: config.get<string>('JWT_ISSUER', 'ecomiq-identity'),
      }),
    }),
    AuthProxyModule,
    // Routes /api/catalog/* to catalog-service (mirrors AuthProxyModule).
    CatalogProxyModule,
    // Routes /api/inventory/* to inventory-service (mirrors CatalogProxyModule).
    InventoryProxyModule,
    // Routes /api/{orders,payments,marketing}/*
    // to the three new services (mirrors CatalogProxyModule/InventoryProxyModule).
    OrderProxyModule,
    PaymentProxyModule,
    MarketingProxyModule,
    // Routes /api/notifications/* to notification-service.
    NotificationProxyModule,
    // Routes /api/shipping/* to shipping-service.
    ShippingProxyModule,
    // Routes /api/crm/* to crm-service.
    CrmProxyModule,
    // Routes /api/purchasing/* to purchasing-service.
    PurchasingProxyModule,
    // Routes /api/media/* to media-service.
    MediaProxyModule,
    HealthModule,
    MarketsProxyModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    PermissionsGuard,
  ],
})
export class AppModule {}
