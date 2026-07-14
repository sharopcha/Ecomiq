import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AuthenticatedSupplier, CurrentSupplier, Public, SupplierAuth } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { PortalService } from './portal.service';
import { SupplierCatalogItemsService } from '../supplier-catalog-items/supplier-catalog-items.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { PortalUpdateSupplierDto } from './dto/portal-update-supplier.dto';
import { CreateSupplierCatalogItemDto } from '../supplier-catalog-items/dto/create-supplier-catalog-item.dto';
import { UpdateSupplierCatalogItemDto } from '../supplier-catalog-items/dto/update-supplier-catalog-item.dto';
import { ListSupplierCatalogItemsQueryDto } from '../supplier-catalog-items/dto/list-supplier-catalog-items-query.dto';

/**
 * Supplier-facing REST — `@Public()` bypasses the app's *global* staff
 * `JwtAuthGuard` (a supplier JWT would never pass that guard — wrong
 * strategy, wrong JWKS, wrong issuer), and `@SupplierAuth()` is the real
 * gate: every route here requires a verified *supplier* JWT instead.
 * `supplier.id`/`supplier.storeId` always come from the verified token
 * (`@CurrentSupplier()`), never a URL param or request body — a supplier
 * can only ever act as themselves. Mirrors crm's `StorefrontController`.
 */
@Controller('portal')
@Public()
@SupplierAuth()
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly catalogItems: SupplierCatalogItemsService,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  @Get('me')
  getMe(@CurrentSupplier() supplier: AuthenticatedSupplier) {
    return this.portal.getProfile(supplier.id, supplier.storeId);
  }

  /** Contact fields only — `status`/`isFeatured`/`isFavorite` stay merchant-owned, see `PortalUpdateSupplierDto`. */
  @Patch('me')
  updateMe(@CurrentSupplier() supplier: AuthenticatedSupplier, @Body() dto: PortalUpdateSupplierDto) {
    return this.portal.updateProfile(supplier.id, supplier.storeId, dto);
  }

  @Get('catalog-items')
  findCatalogItems(
    @CurrentSupplier() supplier: AuthenticatedSupplier,
    @Query() query: ListSupplierCatalogItemsQueryDto,
  ) {
    return this.catalogItems.findAll(supplier.storeId, supplier.id, query);
  }

  @Get('catalog-items/:id')
  findCatalogItem(@CurrentSupplier() supplier: AuthenticatedSupplier, @Param('id') id: string) {
    return this.catalogItems.findOne(supplier.storeId, supplier.id, id);
  }

  @Post('catalog-items')
  createCatalogItem(
    @CurrentSupplier() supplier: AuthenticatedSupplier,
    @Body() dto: CreateSupplierCatalogItemDto,
  ) {
    return this.catalogItems.create(supplier.storeId, supplier.id, dto);
  }

  @Patch('catalog-items/:id')
  updateCatalogItem(
    @CurrentSupplier() supplier: AuthenticatedSupplier,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierCatalogItemDto,
  ) {
    return this.catalogItems.update(supplier.storeId, supplier.id, id, dto);
  }

  @Delete('catalog-items/:id')
  removeCatalogItem(@CurrentSupplier() supplier: AuthenticatedSupplier, @Param('id') id: string) {
    return this.catalogItems.remove(supplier.storeId, supplier.id, id);
  }

  @Post('catalog-items/:id/toggle-in-stock')
  toggleInStock(@CurrentSupplier() supplier: AuthenticatedSupplier, @Param('id') id: string) {
    return this.catalogItems.toggleInStock(supplier.storeId, supplier.id, id);
  }

  /** Own POs, `sent` and beyond only — never `draft` (see `findMineForPortal`'s doc comment). */
  @Get('pos')
  findPos(@CurrentSupplier() supplier: AuthenticatedSupplier, @Query() query: PaginationQueryDto) {
    return this.purchaseOrders.findMineForPortal(supplier.storeId, supplier.id, query);
  }

  @Post('pos/:id/confirm')
  confirmPo(@CurrentSupplier() supplier: AuthenticatedSupplier, @Param('id') id: string) {
    return this.purchaseOrders.confirmAsSupplier(supplier.storeId, supplier.id, id);
  }
}
