import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { CustomerAddressesService } from './customer-addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('customers/:customerId/addresses')
@UseGuards(PermissionsGuard)
export class CustomerAddressesController {
  constructor(private readonly addresses: CustomerAddressesService) {}

  @Get()
  @RequirePermissions('people:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('customerId') customerId: string) {
    return this.addresses.findAll(user.storeId, customerId);
  }

  @Get(':addressId')
  @RequirePermissions('people:read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.addresses.findOne(user.storeId, customerId, addressId);
  }

  @Post()
  @RequirePermissions('people:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addresses.create(user.storeId, customerId, dto);
  }

  @Patch(':addressId')
  @RequirePermissions('people:write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addresses.update(user.storeId, customerId, addressId, dto);
  }

  @Delete(':addressId')
  @RequirePermissions('people:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.addresses.remove(user.storeId, customerId, addressId);
  }
}
