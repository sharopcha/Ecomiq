import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthSharedModule, JwtAuthGuard, PermissionsGuard, StoreContextGuard } from '@temp-nx/auth';
import { PulsarModule } from '@temp-nx/pulsar';
import { mediaDataSourceOptions } from '../data-source';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { FoldersModule } from './folders/folders.module';
import { FilesModule } from './files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(mediaDataSourceOptions),
    ThrottlerModule.forRoot([
      // Same defense-in-depth backstop as every other service — the
      // gateway applies the user-facing rate limit; this is for
      // direct/service-to-service access in local dev.
      { name: 'default', ttl: 60_000, limit: 120 },
    ]),
    // Zero-trust: media-service verifies the end-user JWT itself via
    // identity's JWKS endpoint rather than trusting the gateway (ADR-6) —
    // identical wiring to catalog/shipping/crm's app.module.ts.
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
    // media-service's own domain events (media.file.*). Pure producer —
    // no Pulsar *consumer* connection exists yet (same starting point as
    // catalog before crm's review.events subscription).
    PulsarModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        serviceUrl: config.get<string>('PULSAR_SERVICE_URL', 'pulsar://localhost:6650'),
        tenant: config.get<string>('PULSAR_TENANT', 'ecomiq'),
        namespace: config.get<string>('MEDIA_PULSAR_NAMESPACE', 'media'),
        authToken: config.get<string | undefined>('PULSAR_AUTH_TOKEN', undefined),
      }),
    }),
    // Two S3 clients (internal ops / public presign) + putPresign/getPresign/
    // head/delete/putObject wrappers and key-layout helpers — everything in
    // this service that touches MinIO goes through StorageService. Imported
    // before HealthModule since HealthController now depends on it for the
    // bucket-reachability check.
    StorageModule,
    HealthModule,
    // File Library folders (tree via nullable parent_id): create/rename/
    // move (cycle-checked)/list/delete-if-empty. Exports FoldersService for
    // FilesModule's folderId-ownership checks.
    FoldersModule,
    // Upload flow: presign -> direct browser PUT to MinIO -> complete
    // (HEAD-verified, no row until then). Depends on FoldersModule
    // (folderId validation) and StorageModule (presign/HEAD/delete).
    FilesModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Must come after JwtAuthGuard in this array (guard order follows
    // provider order): asserts `req.user.storeId` exists and stamps
    // `req.storeId` — same ordering rule as every other service.
    { provide: APP_GUARD, useClass: StoreContextGuard },
    // Not a global APP_GUARD — applied per-controller via
    // `@UseGuards(PermissionsGuard)` + `@RequirePermissions('media:...')`.
    PermissionsGuard,
  ],
})
export class AppModule {}
