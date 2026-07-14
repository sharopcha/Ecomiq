import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { StockAuditsService } from './stock-audits.service';
import { CreateStockAuditDto } from './dto/create-stock-audit.dto';
import { FindStockAuditsQueryDto } from './dto/find-stock-audits-query.dto';

/** The Audit Stock modal (submit) + its "Stock adjustment history" right rail (read). */
@Controller('stock-audits')
@UseGuards(PermissionsGuard)
export class StockAuditsController {
  constructor(private readonly stockAudits: StockAuditsService) {}

  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindStockAuditsQueryDto) {
    return this.stockAudits.list(user.storeId, query);
  }

  /** `actorId` comes from the authenticated user, never the request body — see StockAudit.actorId's doc comment. */
  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockAuditDto) {
    return this.stockAudits.create(user.storeId, dto, user.id);
  }
}
