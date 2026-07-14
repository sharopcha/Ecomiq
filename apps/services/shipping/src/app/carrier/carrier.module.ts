import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CarrierProviderPort } from './carrier-provider.port';
import { MockCarrierProvider } from './mock-carrier.provider';

/**
 * Binds `CarrierProviderPort` to whichever adapter `SHIPPING_CARRIER_PROVIDER`
 * selects — the one place in the whole service allowed to know a concrete
 * carrier provider exists. Fails fast at boot on an unrecognized value, not
 * at first request — mirrors `apps/services/payment/src/app/provider/provider.module.ts`.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CarrierProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CarrierProviderPort => {
        const provider = config.get<string>('SHIPPING_CARRIER_PROVIDER', 'mock');
        switch (provider) {
          case 'mock':
            return new MockCarrierProvider();
          default:
            throw new Error(
              `Unknown SHIPPING_CARRIER_PROVIDER "${provider}" — only "mock" is implemented today.`,
            );
        }
      },
    },
  ],
  exports: [CarrierProviderPort],
})
export class CarrierModule {}
