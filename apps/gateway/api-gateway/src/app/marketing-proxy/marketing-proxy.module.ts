import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MarketingProxyController } from './marketing-proxy.controller';
import { MarketingFormsPublicProxyController } from './marketing-forms-public-proxy.controller';

@Module({
  imports: [ConfigModule],
  // MarketingFormsPublicProxyController (the narrow @Public() sub-route)
  // MUST be registered before MarketingProxyController's
  // authenticated catch-all — see that controller's header comment for why.
  controllers: [MarketingFormsPublicProxyController, MarketingProxyController],
})
export class MarketingProxyModule {}
