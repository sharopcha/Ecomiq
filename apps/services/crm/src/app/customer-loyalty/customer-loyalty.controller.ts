import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { PaginationQueryDto } from '@temp-nx/typeorm';
import { Customer } from '../entities/customer.entity';
import { assertCustomerOwned } from '../customers/customer-ownership.util';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ManualAdjustDto } from '../loyalty/dto/manual-adjust.dto';

@Controller('customers/:customerId/loyalty')
@UseGuards(PermissionsGuard)
export class CustomerLoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {}

  @Get()
  @RequirePermissions('people:read')
  async getAccount(@CurrentUser() user: AuthenticatedUser, @Param('customerId') customerId: string) {
    await assertCustomerOwned(this.customerRepo, user.storeId, customerId);
    return this.loyalty.getAccount(user.storeId, customerId);
  }

  @Get('transactions')
  @RequirePermissions('people:read')
  async listTxns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Query() query: PaginationQueryDto,
  ) {
    await assertCustomerOwned(this.customerRepo, user.storeId, customerId);
    return this.loyalty.listTxns(user.storeId, customerId, query);
  }

  /** `people:manage` — a manual points adjustment is a privileged, auditable action (note in `LoyaltyTxn.note`). */
  @Post('adjust')
  @RequirePermissions('people:manage')
  async adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId') customerId: string,
    @Body() dto: ManualAdjustDto,
  ) {
    await assertCustomerOwned(this.customerRepo, user.storeId, customerId);
    return this.loyalty.manualAdjust(user.storeId, customerId, dto.pointsDelta, dto.note);
  }
}
