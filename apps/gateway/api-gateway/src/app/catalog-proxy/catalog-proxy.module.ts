import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CatalogProxyController } from './catalog-proxy.controller';
import { CatalogStorefrontProxyController } from './catalog-storefront-proxy.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CatalogStorefrontProxyController, CatalogProxyController],
})
export class CatalogProxyModule {}
