import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PurchasingAuthProxyController } from './purchasing-auth-proxy.controller';
import { PurchasingPortalProxyController } from './purchasing-portal-proxy.controller';
import { PurchasingProxyController } from './purchasing-proxy.controller';

@Module({
  imports: [ConfigModule],
  // PurchasingAuthProxyController/PurchasingPortalProxyController (the
  // narrow @Public() sub-routes) MUST be registered before
  // PurchasingProxyController's authenticated catch-all — see that
  // controller's header comment for why.
  controllers: [PurchasingAuthProxyController, PurchasingPortalProxyController, PurchasingProxyController],
})
export class PurchasingProxyModule {}
