import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser, CurrentUser, PermissionsGuard, RequirePermissions } from '@temp-nx/auth';
import { assertOwnedByStore } from '@temp-nx/typeorm';
import { OrdersService } from '../orders/orders.service';
import { OrderLine } from '../entities/order-line.entity';
import { OrderStatus } from '../entities/order.entity';
import { SagaState, SagaStatus, SagaType } from '../entities/saga-state.entity';
import { CheckoutSagaOrchestrator } from './saga/checkout-saga.orchestrator';
import { CheckoutOrderDto } from './dto/checkout-order.dto';

const UNIQUE_VIOLATION = '23505';

/**
 * `POST /api/orders/:id/checkout` + `GET /api/orders/:id/checkout-status` —
 * a third bare-base `@Controller()`, same reasoning as
 * `OrderCommentsController`/`InvoicesController`'s doc comments.
 *
 * The "not already in a running saga" guard is enforced twice: this
 * controller pre-checks for a friendlier 409 message, and the migration's
 * partial unique index on `saga_state (order_id) WHERE status='running'`
 * is the actual race-safety backstop a concurrent double-POST collides
 * against (converted back to the same `ConflictException` in the catch
 * below) — same "app-level check for UX, DB constraint for correctness"
 * pattern discounts.service.ts uses for its code uniqueness.
 */
@Controller()
@UseGuards(PermissionsGuard)
export class CheckoutController {
  constructor(
    private readonly orders: OrdersService,
    private readonly orchestrator: CheckoutSagaOrchestrator,
    @InjectRepository(OrderLine) private readonly orderLineRepo: Repository<OrderLine>,
    @InjectRepository(SagaState) private readonly sagaRepo: Repository<SagaState>,
  ) {}

  @Post(':id/checkout')
  @HttpCode(202)
  @RequirePermissions('orders:write')
  async checkout(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CheckoutOrderDto) {
    const order = await this.orders.findOne(user.storeId, id);
    if (order.status !== OrderStatus.Open) {
      throw new ConflictException(`Order ${id} must be open to check out (current: ${order.status})`);
    }

    const lineCount = await this.orderLineRepo.count({ where: { order: { id } } });
    if (lineCount === 0) {
      throw new BadRequestException(`Order ${id} has no lines to check out`);
    }

    const runningSaga = await this.sagaRepo.findOneBy({ order: { id }, status: SagaStatus.Running });
    if (runningSaga) {
      throw new ConflictException(`Order ${id} already has a checkout in progress`);
    }

    try {
      const saga = await this.orchestrator.start(user.storeId, id, dto.discountCode ?? null);
      return { sagaId: saga.id };
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException(`Order ${id} already has a checkout in progress`);
      }
      throw err;
    }
  }

  @Get(':id/checkout-status')
  @RequirePermissions('orders:read')
  async checkoutStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.orders.findOne(user.storeId, id); // 404s on wrong-store/missing order before touching saga_state.

    const saga = await this.sagaRepo.findOne({
      where: { order: { id }, sagaType: SagaType.Checkout },
      order: { startedAt: 'DESC' },
    });
    if (!saga) {
      throw new NotFoundException(`No checkout saga found for order ${id}`);
    }
    assertOwnedByStore(saga, user.storeId, () => new NotFoundException(`No checkout saga found for order ${id}`));

    const payload = saga.payload as Record<string, unknown>;
    return {
      sagaId: saga.id,
      status: saga.status,
      step: saga.step,
      clientSecret: payload.clientSecret ?? null,
      failureReason: payload.failureReason ?? null,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError && (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
