import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShippingWebhooksProxyController } from './shipping-webhooks-proxy.controller';
import { ShippingTrackingProxyController } from './shipping-tracking-proxy.controller';
import { ShippingProxyController } from './shipping-proxy.controller';

@Module({
  imports: [ConfigModule],
  // ShippingWebhooksProxyController/ShippingTrackingProxyController (the
  // narrow @Public() sub-routes) MUST be registered before
  // ShippingProxyController's authenticated catch-all — see that
  // controller's header comment for why.
  controllers: [ShippingWebhooksProxyController, ShippingTrackingProxyController, ShippingProxyController],
})
export class ShippingProxyModule {}
