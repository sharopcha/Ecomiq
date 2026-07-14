import { DynamicModule, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import {
  CUSTOMER_AUTH_MODULE_OPTIONS,
  CustomerAuthSharedModuleOptions,
  CustomerJwtAccessStrategy,
} from './customer-jwt-access.strategy';
import { CustomerJwtGuard } from './guards/customer-jwt-auth.guard';

export interface CustomerAuthSharedModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => CustomerAuthSharedModuleOptions | Promise<CustomerAuthSharedModuleOptions>;
}

/**
 * Import in crm-service to get JWKS-backed *customer* JWT verification:
 * `CustomerAuthSharedModule.forRootAsync({ ... })`, then guard
 * customer-facing routes with `@CustomerAuth()` (or `CustomerJwtGuard`
 * directly) from '@temp-nx/auth'. Deliberately separate from
 * `AuthSharedModule` (staff tokens) — a service can register both without
 * either strategy shadowing the other, since they're registered under
 * distinct Passport strategy names.
 */
@Module({})
export class CustomerAuthSharedModule {
  static forRootAsync(options: CustomerAuthSharedModuleAsyncOptions): DynamicModule {
    return {
      module: CustomerAuthSharedModule,
      imports: [PassportModule, ...(options.imports ?? [])],
      providers: [
        {
          provide: CUSTOMER_AUTH_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        CustomerJwtAccessStrategy,
        CustomerJwtGuard,
      ],
      exports: [PassportModule, CustomerJwtGuard],
    };
  }
}
