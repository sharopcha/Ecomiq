import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentProviderPort } from './payment-provider.port';
import { MockPaymentProvider } from './mock-payment.provider';

/**
 * Binds `PaymentProviderPort` to whichever adapter `PAYMENT_PROVIDER`
 * selects — the one place in the whole service allowed to know a concrete
 * provider exists. Fails fast at boot on an unrecognized value (not at
 * first request) — same "surface config mistakes immediately" reasoning as
 * every other `forRootAsync` factory in this repo.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PaymentProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProviderPort => {
        const provider = config.get<string>('PAYMENT_PROVIDER', 'mock');
        switch (provider) {
          case 'mock':
            return new MockPaymentProvider(
              config.get<string>('MOCK_WEBHOOK_SECRET', 'dev-mock-webhook-secret'),
            );
          default:
            throw new Error(
              `Unknown PAYMENT_PROVIDER "${provider}" — only "mock" is implemented today.`,
            );
        }
      },
    },
  ],
  exports: [PaymentProviderPort],
})
export class ProviderModule {}
