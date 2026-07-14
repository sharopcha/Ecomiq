import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { InvoicesService } from './invoices.service';

/** `/api/orders/:id/invoice` — a third bare-base `@Controller()`, same reasoning as `OrderCommentsController`'s doc comment. */
@Controller()
@UseGuards(PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post(':id/invoice')
  @HttpCode(201)
  @RequirePermissions('orders:write')
  create(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.invoices.createForOrder(user.storeId, id);
  }
}
