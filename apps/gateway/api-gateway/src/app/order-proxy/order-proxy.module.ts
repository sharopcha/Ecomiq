import { Module } from '@nestjs/common';
import { OrderProxyController } from './order-proxy.controller';
import { OrderStorefrontProxyController } from './order-storefront-proxy.controller';

@Module({
  controllers: [OrderProxyController, OrderStorefrontProxyController],
})
export class OrderProxyModule {}
