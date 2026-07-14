import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { paymentDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RefundsModule } from './refunds/refunds.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(paymentDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as identity/catalog/inventory — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: payment-service verifies the end-user JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to catalog/inventory's app.module.ts.
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
    // Registers PulsarProducerService + the outbox relay poller for
    // payment-service's own domain events (payments.payment.*,
    // payments.refund.*). Producer/outbox-relay side only — the
    // payment.commands PulsarServer *consumer* connection is wired
    // separately in main.ts, same hybrid-app pattern as inventory's.
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('PAYMENT_PULSAR_NAMESPACE', 'payments'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    HealthModule,
    // Provider port + mock adapter, payment intents CRUD.
    PaymentsModule,
    // Refund execution (command consumer + webhook settlement path)
    // registered before WebhooksModule, which imports it.
    RefundsModule,
    // Signed provider webhook inbox.
    WebhooksModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as catalog/inventory.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions(...)`, same
    // pattern as catalog/inventory/api-gateway.
    PermissionsGuard,
  ],
})
export class AppModule {}
