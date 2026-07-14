import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InventoryProxyController } from './inventory-proxy.controller';

@Module({
  imports: [ConfigModule],
  controllers: [InventoryProxyController],
})
export class InventoryProxyModule {}
