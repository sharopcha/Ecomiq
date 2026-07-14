import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierCatalogItemsModule } from '../supplier-catalog-items/supplier-catalog-items.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier]), SupplierCatalogItemsModule, PurchaseOrdersModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
