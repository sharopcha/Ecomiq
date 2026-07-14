import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { OrdersService } from '../orders/orders.service';
import { OrderCommentsService } from './order-comments.service';
import { CreateOrderCommentDto } from './dto/create-order-comment.dto';

const SUBJECT_TABLE = 'order';

/**
 * `/api/orders/:id/comments` — a second `@Controller()` sharing the same
 * bare base path as `OrdersController`, distinguished by its method-level
 * `:id/comments` paths (Nest has no issue with two controllers on the same
 * base string as long as the full effective routes differ). Confirms the
 * order exists and belongs to the caller's store via `OrdersService.findOne`
 * before touching `OrderCommentsService` — a 404 on a wrong-store/missing
 * order id, same as every other nested resource in this repo.
 */
@Controller()
@UseGuards(PermissionsGuard)
export class OrderCommentsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly comments: OrderCommentsService,
  ) {}

  @Get(':id/comments')
  @RequirePermissions('orders:read')
  async list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.orders.findOne(user.storeId, id);
    return this.comments.list(user.storeId, SUBJECT_TABLE, id);
  }

  @Post(':id/comments')
  @RequirePermissions('orders:write')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateOrderCommentDto,
  ) {
    await this.orders.findOne(user.storeId, id);
    return this.comments.create(user.storeId, SUBJECT_TABLE, id, { ...dto, authorId: user.id });
  }
}
