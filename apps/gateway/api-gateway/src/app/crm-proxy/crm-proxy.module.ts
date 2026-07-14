import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CrmAuthProxyController } from './crm-auth-proxy.controller';
import { CrmStorefrontProxyController } from './crm-storefront-proxy.controller';
import { CrmProxyController } from './crm-proxy.controller';

@Module({
  imports: [ConfigModule],
  // CrmAuthProxyController/CrmStorefrontProxyController (the narrow
  // @Public() sub-routes) MUST be registered before CrmProxyController's
  // authenticated catch-all — see that controller's header comment for why.
  controllers: [CrmAuthProxyController, CrmStorefrontProxyController, CrmProxyController],
})
export class CrmProxyModule {}
