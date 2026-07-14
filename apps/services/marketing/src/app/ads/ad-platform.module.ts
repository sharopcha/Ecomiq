import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdPlatformPort } from './ad-platform.port';
import { LoggingAdPlatformProvider } from './logging-ad-platform.provider';

/**
 * Binds `AdPlatformPort` to whichever adapter `AD_PLATFORM_PROVIDER`
 * selects — mirrors payment's `ProviderModule` exactly. Fails fast at boot
 * on an unrecognized value, not at first request.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AdPlatformPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AdPlatformPort => {
        const provider = config.get<string>('AD_PLATFORM_PROVIDER', 'logging-stub');
        switch (provider) {
          case 'logging-stub':
            return new LoggingAdPlatformProvider();
          default:
            throw new Error(
              `Unknown AD_PLATFORM_PROVIDER "${provider}" — only "logging-stub" is implemented today.`,
            );
        }
      },
    },
  ],
  exports: [AdPlatformPort],
})
export class AdPlatformModule {}
