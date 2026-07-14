import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationWebhooksProxyController } from './notification-webhooks-proxy.controller';
import { NotificationProxyController } from './notification-proxy.controller';

@Module({
  imports: [ConfigModule],
  // NotificationWebhooksProxyController (the narrow @Public() sub-route)
  // MUST be registered before NotificationProxyController's authenticated
  // catch-all — see that controller's header comment for why.
  controllers: [NotificationWebhooksProxyController, NotificationProxyController],
})
export class NotificationProxyModule {}
