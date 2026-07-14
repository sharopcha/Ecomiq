import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { LicenseKeysService } from './license-keys.service';
import { AddLicenseKeysDto } from './dto/add-license-keys.dto';
import { ReserveLicenseKeyDto } from './dto/reserve-license-key.dto';
import { FindLicenseKeysQueryDto } from './dto/find-license-keys-query.dto';

@Controller('products/:productId/license-keys')
@UseGuards(PermissionsGuard)
export class LicenseKeysController {
  constructor(private readonly keys: LicenseKeysService) {}

  @Get()
  @RequirePermissions('products:read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Query() query: FindLicenseKeysQueryDto,
  ) {
    return this.keys.findAll(user.storeId, productId, query);
  }

  /** Bulk import — accepts one or many keyValues in a single call. */
  @Post()
  @RequirePermissions('products:write')
  addMany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: AddLicenseKeysDto,
  ) {
    return this.keys.addMany(user.storeId, productId, dto);
  }

  /** Hands out the oldest Available key — what an eventual orders-service checkout flow calls. */
  @Post('reserve')
  @RequirePermissions('products:write')
  reserveNext(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() dto: ReserveLicenseKeyDto,
  ) {
    return this.keys.reserveNext(user.storeId, productId, dto);
  }

  @Post(':keyId/revoke')
  @RequirePermissions('products:write')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.keys.revoke(user.storeId, productId, keyId);
  }

  @Delete(':keyId')
  @RequirePermissions('products:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('keyId') keyId: string,
  ) {
    return this.keys.remove(user.storeId, productId, keyId);
  }
}
