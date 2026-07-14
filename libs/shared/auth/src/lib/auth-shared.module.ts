import { DynamicModule, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import {
  AUTH_MODULE_OPTIONS,
  AuthSharedModuleOptions,
  JwtAccessStrategy,
} from './jwt-access.strategy';
import { PermissionsGuard } from './guards/permissions.guard';
import { StoreContextGuard } from './guards/store-context.guard';
import { InternalAuthGuard } from './guards/internal-auth.guard';
import { InternalTokenVerifierService } from './internal-token-verifier.service';

export interface AuthSharedModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (
    ...args: any[]
  ) => AuthSharedModuleOptions | Promise<AuthSharedModuleOptions>;
}

/**
 * Import in api-gateway (and, later, any other service) to get JWKS-backed
 * JWT verification: `AuthSharedModule.forRootAsync({ ... })`, then guard
 * routes with `JwtAuthGuard` (+ optional `PermissionsGuard`,
 * `StoreContextGuard`) from '@temp-nx/auth'.
 */
@Module({})
export class AuthSharedModule {
  static forRootAsync(options: AuthSharedModuleAsyncOptions): DynamicModule {
    return {
      module: AuthSharedModule,
      imports: [PassportModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: AUTH_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        JwtAccessStrategy,
        PermissionsGuard,
        StoreContextGuard,
        InternalTokenVerifierService,
        InternalAuthGuard,
      ],
      exports: [
        PassportModule,
        PermissionsGuard,
        StoreContextGuard,
        InternalTokenVerifierService,
        InternalAuthGuard,
      ],
    };
  }
}
