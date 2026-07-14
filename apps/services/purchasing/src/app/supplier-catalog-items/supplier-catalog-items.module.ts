import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from '../entities/supplier.entity';
import { SupplierCatalogItem } from '../entities/supplier-catalog-item.entity';
import { SupplierCatalogItemsController } from './supplier-catalog-items.controller';
import { SupplierCatalogItemsService } from './supplier-catalog-items.service';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierCatalogItem])],
  controllers: [SupplierCatalogItemsController],
  providers: [SupplierCatalogItemsService],
  exports: [SupplierCatalogItemsService],
})
export class SupplierCatalogItemsModule {}
