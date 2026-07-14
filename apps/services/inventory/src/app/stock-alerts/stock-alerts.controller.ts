import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { StockAlertsService } from './stock-alerts.service';
import { CreateStockAlertDto } from './dto/create-stock-alert.dto';
import { UpdateStockAlertDto } from './dto/update-stock-alert.dto';
import { FindStockAlertsQueryDto } from './dto/find-stock-alerts-query.dto';

@Controller('stock-alerts')
@UseGuards(PermissionsGuard)
export class StockAlertsController {
  constructor(private readonly stockAlerts: StockAlertsService) {}

  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindStockAlertsQueryDto) {
    return this.stockAlerts.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockAlerts.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockAlertDto) {
    return this.stockAlerts.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStockAlertDto,
  ) {
    return this.stockAlerts.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockAlerts.remove(user.storeId, id);
  }
}
