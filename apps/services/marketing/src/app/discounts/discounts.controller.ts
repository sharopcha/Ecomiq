import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { DiscountsService } from './discounts.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

/**
 * `/api/marketing/discounts/*` (gateway strips `/api/marketing`, so this
 * controller mounts at `discounts`, not `marketing/discounts` — same
 * convention as every other service's controllers not being prefixed with
 * their own service name). Uses the `campaign` permission workspace — the
 * closest existing fit for a marketing feature (no dedicated `marketing`
 * scope exists in `@temp-nx/auth`'s `ALL_WORKSPACES`, and this doesn't
 * warrant adding one the way payment-service's total absence of coverage
 * did).
 */
@Controller('discounts')
@UseGuards(PermissionsGuard)
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  @RequirePermissions('campaign:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.discounts.findAll(user.storeId, query);
  }

  @Get(':id')
  @RequirePermissions('campaign:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.discounts.findOne(user.storeId, id);
  }

  @Post()
  @RequirePermissions('campaign:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDiscountDto) {
    return this.discounts.create(user.storeId, dto);
  }

  @Patch(':id')
  @RequirePermissions('campaign:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.discounts.update(user.storeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('campaign:write')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.discounts.remove(user.storeId, id);
  }

  @Post(':id/activate')
  @RequirePermissions('campaign:write')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.discounts.activate(user.storeId, id);
  }

  @Post(':id/archive')
  @RequirePermissions('campaign:write')
  archive(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.discounts.archive(user.storeId, id);
  }
}
