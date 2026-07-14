import { Module } from '@nestjs/common';
import { MarketsProxyController } from './markets-proxy.controller';

@Module({
  controllers: [MarketsProxyController],
})
export class MarketsProxyModule {}
