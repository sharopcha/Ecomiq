import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
  PermissionsGuard,
  RequirePermissions,
} from '@temp-nx/auth';
import { ReferralsService } from './referrals.service';
import { ListReferralsQueryDto } from './dto/list-referrals-query.dto';

/** Admin, read-only — referrals are created via the register-with-code flow, never directly by staff. */
@Controller('referrals')
@UseGuards(PermissionsGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get()
  @RequirePermissions('people:read')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ListReferralsQueryDto) {
    return this.referrals.listAdmin(user.storeId, query);
  }
}
