import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { OrderCommentsService } from '../comments/order-comments.service';
import { CreateOrderCommentDto } from '../comments/dto/create-order-comment.dto';
import { ReturnsService } from './returns.service';

const SUBJECT_TABLE = 'return_request';

/** `/api/orders/returns/:id/comments` — the RMA timeline, same pattern as `OrderCommentsController`. */
@Controller('returns')
@UseGuards(PermissionsGuard)
export class ReturnCommentsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly comments: OrderCommentsService,
  ) {}

  @Get(':id/comments')
  @RequirePermissions('orders:read')
  async list(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.returns.findOne(user.storeId, id);
    return this.comments.list(user.storeId, SUBJECT_TABLE, id);
  }

  @Post(':id/comments')
  @RequirePermissions('orders:write')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateOrderCommentDto,
  ) {
    await this.returns.findOne(user.storeId, id);
    return this.comments.create(user.storeId, SUBJECT_TABLE, id, { ...dto, authorId: user.id });
  }
}
