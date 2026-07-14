import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginatedResult, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Order } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { ReturnRequest, ReturnShipping, ReturnStatus } from '../entities/return-request.entity';
import { ReturnLine } from '../entities/return-line.entity';
import { Refund, RefundStatus, RefundType } from '../entities/refund.entity';
import { writeActivityLog } from '../common/activity-log.util';
import { claimNextSequenceNumber } from '../common/store-sequence.util';
import { OrderEventType, RETURN_AGGREGATE_TYPE } from '../events/order-event-types';
import { advanceShippingStatus } from './shipping-status-advance.util';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { FindReturnsQueryDto } from './dto/find-returns-query.dto';

const RETURN_SEQUENCE_KIND = 'rma';
const SUBJECT_TABLE = 'return_request';
const DEFAULT_RMA_EXPIRY_DAYS = 14;

/**
 * RMA request machine (data-model rule 3): `status`
 * (`pending_approval → approved|rejected`, `approved → resolved` once
 * inspected + refund settled) and `shippingStatus`
 * (`none → sending → delivered → received`) are independent state
 * machines — `advanceShippingStatus` never touches `status` and vice
 * versa. The refund settlement loop is the gate itself; until then
 * `resolve()` only accepts `refundType: 'none'`.
 */
@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnRequest) private readonly repo: Repository<ReturnRequest>,
    @InjectRepository(Refund) private readonly refundRepo: Repository<Refund>,
  ) {}

  async create(storeId: string, dto: CreateReturnRequestDto): Promise<ReturnRequest> {
    return this.repo.manager.transaction(async (manager) => {
      const order = await manager.findOneBy(Order, { id: dto.orderId });
      const ownedOrder = assertOwnedByStore(order, storeId, () => new NotFoundException(`Order ${dto.orderId} not found`));

      const seq = await claimNextSequenceNumber(manager, storeId, RETURN_SEQUENCE_KIND);
      const expiresAt = new Date(Date.now() + this.expiryDays() * 24 * 60 * 60 * 1000);

      const returnRequest = manager.create(ReturnRequest, {
        storeId,
        displayId: `RMA-${seq}`,
        order: ownedOrder,
        customerId: ownedOrder.customerId ?? null,
        reason: dto.reason ?? null,
        expiresAt,
      });
      const savedReturn = await manager.save(returnRequest);

      const lines: ReturnLine[] = [];
      for (const lineDto of dto.lines) {
        const orderLine = await manager.findOne(OrderLine, {
          where: { id: lineDto.orderLineId },
          relations: { order: true },
        });
        if (!orderLine || orderLine.order.id !== ownedOrder.id) {
          throw new BadRequestException(`Order line ${lineDto.orderLineId} does not belong to order ${ownedOrder.id}`);
        }
        lines.push(manager.create(ReturnLine, { returnRequest: savedReturn, orderLine, qty: lineDto.qty }));
      }
      await manager.save(lines);

      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: savedReturn.id,
        verb: 'return.requested',
        data: { displayId: savedReturn.displayId, orderId: ownedOrder.id },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.ReturnRequested,
        storeId,
        aggregateType: RETURN_AGGREGATE_TYPE,
        aggregateId: savedReturn.id,
        payload: this.toEventPayload(savedReturn, ownedOrder.id),
      });
      // The delayed self-trigger for auto-expiry — see OrderEventType.ReturnExpiryCheck's doc comment.
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.ReturnExpiryCheck,
        storeId,
        aggregateType: RETURN_AGGREGATE_TYPE,
        aggregateId: savedReturn.id,
        payload: { returnRequestId: savedReturn.id },
        deliverAt: expiresAt,
      });

      savedReturn.order = ownedOrder;
      return savedReturn;
    });
  }

  async approve(storeId: string, id: string): Promise<ReturnRequest> {
    const returnRequest = await this.findOne(storeId, id);
    if (returnRequest.status !== ReturnStatus.PendingApproval) {
      throw new ConflictException(`Return ${id} can only be approved from pending_approval (current: ${returnRequest.status})`);
    }
    returnRequest.status = ReturnStatus.Approved;
    returnRequest.approvedAt = new Date();
    return this.persistTransition(storeId, returnRequest, OrderEventType.ReturnApproved, 'return.approved');
  }

  async reject(storeId: string, id: string, reason?: string): Promise<ReturnRequest> {
    const returnRequest = await this.findOne(storeId, id);
    if (returnRequest.status !== ReturnStatus.PendingApproval) {
      throw new ConflictException(`Return ${id} can only be rejected from pending_approval (current: ${returnRequest.status})`);
    }
    returnRequest.status = ReturnStatus.Rejected;
    returnRequest.rejectedAt = new Date();
    if (reason) returnRequest.note = reason;
    return this.persistTransition(storeId, returnRequest, OrderEventType.ReturnRejected, 'return.rejected', { reason });
  }

  /** Only meaningful once `approved` — idempotent once already inspected (no duplicate activity_log row). */
  async inspect(storeId: string, id: string): Promise<ReturnRequest> {
    const returnRequest = await this.findOne(storeId, id);
    if (returnRequest.status !== ReturnStatus.Approved) {
      throw new ConflictException(`Return ${id} can only be inspected once approved (current: ${returnRequest.status})`);
    }
    if (returnRequest.inspected) {
      return returnRequest;
    }
    returnRequest.inspected = true;
    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(returnRequest);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'return.inspected',
      });
      return saved;
    });
  }

  /**
   * `approved -> resolved` only if `inspected === true` and, per data-model
   * rule 3, the refund side is settled: `refundType === 'none'` needs
   * nothing further (there was never a refund to wait for); any other
   * refundType requires a `Refund` row against this RMA to have already
   * reached `refunded`. In practice a refund-carrying
   * RMA is usually already resolved by the time anyone calls this
   * manually — `settleFromRefund()` below does it automatically the moment
   * `payments.refund.succeeded` lands — so this path mostly serves the
   * `'none'` case and idempotent re-calls.
   */
  async resolve(storeId: string, id: string, refundType: RefundType): Promise<ReturnRequest> {
    const returnRequest = await this.findOne(storeId, id);
    if (returnRequest.status === ReturnStatus.Resolved) {
      return returnRequest; // idempotent — likely already resolved by settleFromRefund().
    }
    if (returnRequest.status !== ReturnStatus.Approved) {
      throw new ConflictException(`Return ${id} can only be resolved from approved (current: ${returnRequest.status})`);
    }
    if (!returnRequest.inspected) {
      throw new ConflictException(`Return ${id} must be inspected before it can be resolved`);
    }
    if (refundType !== RefundType.None) {
      const settled = await this.refundRepo.exists({
        where: { returnRequest: { id }, status: RefundStatus.Refunded },
      });
      if (!settled) {
        throw new BadRequestException(
          `Return ${id} cannot be resolved with refundType "${refundType}" until its refund has settled`,
        );
      }
    }
    returnRequest.status = ReturnStatus.Resolved;
    returnRequest.resolvedAt = new Date();
    return this.persistTransition(storeId, returnRequest, OrderEventType.ReturnResolved, 'return.resolved');
  }

  /**
   * Invoked by the refund settlement handler once
   * `payments.refund.succeeded` lands for a refund linked to this RMA —
   * completes the gate `resolve()` above enforces manually. Silent no-op
   * if the RMA isn't `approved` + `inspected` (an un-inspected or
   * already-resolved/rejected RMA has nothing for this to do) — same
   * idempotent-consumer reasoning as `expire()`.
   */
  async settleFromRefund(storeId: string, id: string): Promise<void> {
    const returnRequest = await this.repo.findOneBy({ id });
    if (
      !returnRequest ||
      returnRequest.storeId !== storeId ||
      returnRequest.status !== ReturnStatus.Approved ||
      !returnRequest.inspected
    ) {
      return;
    }
    returnRequest.status = ReturnStatus.Resolved;
    returnRequest.resolvedAt = new Date();
    await this.persistTransition(storeId, returnRequest, OrderEventType.ReturnResolved, 'return.resolved');
  }

  /** One step forward on the shipping chip — independent of `status` (data-model rule 3). */
  async advanceShippingStatus(storeId: string, id: string): Promise<ReturnRequest> {
    const returnRequest = await this.findOne(storeId, id);
    const result = advanceShippingStatus(returnRequest.shippingStatus);
    if (result.ok === false) {
      throw new ConflictException(`Return ${id} shipping status is already at its final state`);
    }
    returnRequest.shippingStatus = result.status;
    return this.persistTransition(
      storeId,
      returnRequest,
      OrderEventType.ReturnShippingStatusChanged,
      'return.shipping_status_changed',
      { shippingStatus: returnRequest.shippingStatus },
    );
  }

  /**
   * Invoked by `ReturnExpiryController` when the `expiresAt`-delayed Pulsar
   * message finally arrives. Idempotent and side-effect-free on anything no
   * longer `pending_approval` — same reasoning as
   * `ReservationsService.expire()`: Pulsar's at-least-once delivery means
   * this can run more than once, and the normal case (already
   * approved/rejected long before expiry) must be a silent no-op, not an
   * error.
   */
  async expire(storeId: string, id: string): Promise<void> {
    const returnRequest = await this.repo.findOneBy({ id });
    if (!returnRequest || returnRequest.storeId !== storeId || returnRequest.status !== ReturnStatus.PendingApproval) {
      return;
    }
    returnRequest.status = ReturnStatus.Expired;
    await this.persistTransition(storeId, returnRequest, OrderEventType.ReturnExpired, 'return.expired');
  }

  async findOne(storeId: string, id: string): Promise<ReturnRequest> {
    const entity = await this.repo.findOne({ where: { id }, relations: { order: true } });
    return assertOwnedByStore(entity, storeId, () => new NotFoundException(`Return ${id} not found`));
  }

  async list(storeId: string, query: FindReturnsQueryDto): Promise<PaginatedResult<ReturnRequest>> {
    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.order', 'order')
      .where('r.store_id = :storeId', { storeId });

    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.orderId) qb.andWhere('order.id = :orderId', { orderId: query.orderId });

    return paginate(qb, 'r', query);
  }

  private async persistTransition(
    storeId: string,
    entity: ReturnRequest,
    eventType: string,
    verb: string,
    extraData?: Record<string, unknown>,
  ): Promise<ReturnRequest> {
    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(entity);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb,
        data: extraData ?? { status: saved.status },
      });
      await recordOutboxEvent(manager, {
        eventType,
        storeId,
        aggregateType: RETURN_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved, saved.order?.id),
      });
      return saved;
    });
  }

  private expiryDays(): number {
    const raw = Number(process.env.RMA_EXPIRY_DAYS ?? DEFAULT_RMA_EXPIRY_DAYS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RMA_EXPIRY_DAYS;
  }

  private toEventPayload(returnRequest: ReturnRequest, orderId?: string): Record<string, unknown> {
    return {
      returnId: returnRequest.id,
      storeId: returnRequest.storeId,
      orderId: orderId ?? returnRequest.order?.id,
      displayId: returnRequest.displayId,
      status: returnRequest.status,
      shippingStatus: returnRequest.shippingStatus,
      inspected: returnRequest.inspected,
      // Additive enrichment for notification-plan Step 10 — this event had
      // no consumer before now, so nothing downstream observed the gap
      // until notification-service actually needed a real recipient
      // address for the RMA-approval email. Same "extend a producer's
      // payload additively when a real consumer needs it" precedent as the
      // refund payload's `email` field (Step 7) and catalog's `categoryName`
      // enrichment. `findOne()` always loads the `order` relation, so this
      // is populated on every transition this method is actually called
      // from.
      email: returnRequest.order?.contactEmail ?? null,
    };
  }
}
