import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentWebhooksProxyController } from './payment-webhooks-proxy.controller';
import { PaymentProxyController } from './payment-proxy.controller';

@Module({
  imports: [ConfigModule],
  // PaymentWebhooksProxyController (the narrow @Public() sub-route) MUST be
  // registered before PaymentProxyController's authenticated catch-all —
  // see that controller's header comment for why.
  controllers: [PaymentWebhooksProxyController, PaymentProxyController],
})
export class PaymentProxyModule {}
