import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { InternalTokenClientModule } from '@temp-nx/auth';
import { SendLog } from '../entities/send-log.entity';
import { ChannelsModule } from '../channels/channels.module';
import { WebhooksController } from './webhooks.controller';
import { WebhookDispatchService } from './webhook-dispatch.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SendLog]),
    ChannelsModule,
    InternalTokenClientModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        tokenUrl: config.get<string>('IDENTITY_TOKEN_URL', 'http://localhost:3001/api/auth/token'),
        clientId: config.get<string>('NOTIFICATION_SERVICE_CLIENT_ID', 'notification-service'),
        clientSecret: config.get<string>('NOTIFICATION_SERVICE_CLIENT_SECRET', ''),
        scope: 'marketing:record_send_event',
      }),
    }),
  ],
  controllers: [WebhooksController],
  providers: [WebhookDispatchService],
})
export class WebhooksModule {}
