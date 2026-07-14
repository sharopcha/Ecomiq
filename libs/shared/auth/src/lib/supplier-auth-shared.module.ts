import { DynamicModule, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import {
  SUPPLIER_AUTH_MODULE_OPTIONS,
  SupplierAuthSharedModuleOptions,
  SupplierJwtAccessStrategy,
} from './supplier-jwt-access.strategy';
import { SupplierJwtGuard } from './guards/supplier-jwt-auth.guard';

export interface SupplierAuthSharedModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => SupplierAuthSharedModuleOptions | Promise<SupplierAuthSharedModuleOptions>;
}

/**
 * Import in purchasing-service to get JWKS-backed *supplier* JWT
 * verification: `SupplierAuthSharedModule.forRootAsync({ ... })`, then
 * guard portal routes with `@SupplierAuth()` (or `SupplierJwtGuard`
 * directly) from '@temp-nx/auth'. Deliberately separate from
 * `AuthSharedModule` (staff tokens) — a service can register both without
 * either strategy shadowing the other, since they're registered under
 * distinct Passport strategy names.
 */
@Module({})
export class SupplierAuthSharedModule {
  static forRootAsync(options: SupplierAuthSharedModuleAsyncOptions): DynamicModule {
    return {
      module: SupplierAuthSharedModule,
      imports: [PassportModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: SUPPLIER_AUTH_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        SupplierJwtAccessStrategy,
        SupplierJwtGuard,
      ],
      exports: [PassportModule, SupplierJwtGuard],
    };
  }
}
