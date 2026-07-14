import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediaPublicProxyController } from './media-public-proxy.controller';
import { MediaProxyController } from './media-proxy.controller';

@Module({
  imports: [ConfigModule],
  // MediaPublicProxyController (the narrow @Public() sub-route) MUST be
  // registered before MediaProxyController's authenticated catch-all — see
  // that controller's header comment for why.
  controllers: [MediaPublicProxyController, MediaProxyController],
})
export class MediaProxyModule {}
