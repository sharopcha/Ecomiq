import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { PaymentsService } from './payments.service';
import { CreateIntentDto } from './dto/create-intent.dto';

/**
 * `/api/payments/intents/*` (gateway strips `/api/payments`, so this
 * controller mounts at `intents`, not `payments/intents` — same convention
 * as inventory's controllers not being prefixed with `inventory`).
 *
 * Uses the `payments:*` permission scope (an addition to
 * `@temp-nx/auth`'s `ALL_WORKSPACES` — nothing existing covered a
 * payment-specific permission).
 */
@Controller('intents')
@UseGuards(PermissionsGuard)
export class IntentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @RequirePermissions('payments:write')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIntentDto) {
    const { payment } = await this.payments.createIntent(user.storeId, dto);
    return payment;
  }

  @Post(':id/cancel')
  @RequirePermissions('payments:write')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payments.cancelIntent(user.storeId, id);
  }

  @Get(':id')
  @RequirePermissions('payments:read')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.payments.getById(user.storeId, id);
  }
}
