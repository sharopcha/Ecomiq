import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { StockMovementsService } from './stock-movements.service';
import { FindStockMovementsQueryDto } from './dto/find-stock-movements-query.dto';

/**
 * Read-only — the ledger itself is only ever written via
 * StockMovementsService.record(), called internally by other modules
 * (audit stock, reservations, reorder receipts), never directly through
 * an HTTP write endpoint.
 */
@Controller('stock-movements')
@UseGuards(PermissionsGuard)
export class StockMovementsController {
  constructor(private readonly stockMovements: StockMovementsService) {}

  /** "Stock History" row action on the Inventory list. */
  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindStockMovementsQueryDto) {
    return this.stockMovements.list(user.storeId, query);
  }
}
