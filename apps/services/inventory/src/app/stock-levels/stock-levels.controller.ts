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
import { StockLevelsService } from './stock-levels.service';
import { CreateStockLevelDto } from './dto/create-stock-level.dto';
import { UpdateStockLevelDto } from './dto/update-stock-level.dto';
import { FindStockLevelsQueryDto } from './dto/find-stock-levels-query.dto';

@Controller('stock-levels')
@UseGuards(PermissionsGuard)
export class StockLevelsController {
  constructor(private readonly stockLevels: StockLevelsService) {}

  /** The Inventory list screen — see StockLevelsService.list's doc comment for the aggregation-across-locations behavior. */
  @Get()
  @RequirePermissions('inventory:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: FindStockLevelsQueryDto) {
    return this.stockLevels.list(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockLevels.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('inventory:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStockLevelDto) {
    return this.stockLevels.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('inventory:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStockLevelDto,
  ) {
    return this.stockLevels.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('inventory:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.stockLevels.remove(user.storeId, id);
  }
}
