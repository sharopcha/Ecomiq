import { DynamicModule, Module } from '@nestjs/common';
import { INTERNAL_TOKEN_CLIENT_OPTIONS, InternalTokenClient, InternalTokenClientOptions } from './internal-token.client';

export interface InternalTokenClientAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => InternalTokenClientOptions | Promise<InternalTokenClientOptions>;
}

/**
 * A deliberately separate module from `AuthSharedModule` — that one verifies
 * *inbound* tokens (JWKS-backed, every service needs it for its own HTTP
 * guard chain); this one fetches and caches *outbound* client-credentials
 * tokens for a single specific service account. Only order-service's
 * checkout saga needs this today — folding it into
 * `AuthSharedModule.forRootAsync` would force every other
 * service to also carry an unused `tokenUrl`/`clientId`/`clientSecret`
 * config shape it has no use for.
 */
@Module({})
export class InternalTokenClientModule {
  static forRootAsync(options: InternalTokenClientAsyncOptions): DynamicModule {
    return {
      module: InternalTokenClientModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: INTERNAL_TOKEN_CLIENT_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        InternalTokenClient,
      ],
      exports: [InternalTokenClient],
    };
  }
}
