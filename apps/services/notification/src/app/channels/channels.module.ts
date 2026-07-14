import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailProviderPort } from './email-provider.port';
import { SmsProviderPort } from './sms-provider.port';
import { WhatsAppProviderPort } from './whatsapp-provider.port';
import { MockEmailProvider } from './mock-email.provider';
import { MockSmsProvider } from './mock-sms.provider';
import { MockWhatsAppProvider } from './mock-whatsapp.provider';
import { InAppChannel } from './in-app.channel';

/**
 * Binds each channel port to whichever adapter its own env var selects —
 * mirrors payment's `ProviderModule`/marketing's `AdPlatformModule`
 * exactly: the only file allowed to know "mock" is a concrete choice,
 * fails fast at boot on an unrecognized value. Real SES/Resend (email),
 * Twilio (SMS), Meta (WhatsApp) adapters are future drop-ins behind these
 * same ports — nothing else in this service (`DispatchService`, Step 6)
 * will ever know which one is active.
 */
@Module({
  imports: [ConfigModule, NotificationsModule],
  providers: [
    {
      provide: EmailProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService): EmailProviderPort => {
        const provider = config.get<string>('NOTIFICATION_EMAIL_PROVIDER', 'mock');
        switch (provider) {
          case 'mock':
            return new MockEmailProvider(
              config.get<string>('NOTIFICATION_WEBHOOK_SECRET', 'dev-mock-webhook-secret'),
            );
          default:
            throw new Error(
              `Unknown NOTIFICATION_EMAIL_PROVIDER "${provider}" — only "mock" is implemented today.`,
            );
        }
      },
    },
    {
      provide: SmsProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SmsProviderPort => {
        const provider = config.get<string>('NOTIFICATION_SMS_PROVIDER', 'mock');
        switch (provider) {
          case 'mock':
            return new MockSmsProvider();
          default:
            throw new Error(
              `Unknown NOTIFICATION_SMS_PROVIDER "${provider}" — only "mock" is implemented today.`,
            );
        }
      },
    },
    {
      provide: WhatsAppProviderPort,
      inject: [ConfigService],
      useFactory: (config: ConfigService): WhatsAppProviderPort => {
        const provider = config.get<string>('NOTIFICATION_WHATSAPP_PROVIDER', 'mock');
        switch (provider) {
          case 'mock':
            return new MockWhatsAppProvider();
          default:
            throw new Error(
              `Unknown NOTIFICATION_WHATSAPP_PROVIDER "${provider}" — only "mock" is implemented today.`,
            );
        }
      },
    },
    InAppChannel,
  ],
  exports: [EmailProviderPort, SmsProviderPort, WhatsAppProviderPort, InAppChannel],
})
export class ChannelsModule {}
