import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assertOwnedByStore } from '@temp-nx/typeorm';
import { recordOutboxEvent, topicForCommands } from '@temp-nx/pulsar';
import { Order } from '../entities/order.entity';
import { ReturnRequest } from '../entities/return-request.entity';
import { Refund, RefundStatus, RefundType } from '../entities/refund.entity';
import { writeActivityLog } from '../common/activity-log.util';
import { OrderEventType, REFUND_AGGREGATE_TYPE } from '../events/order-event-types';
import { ReturnsService } from '../returns/returns.service';
import { assertRefundAmount } from './assert-refund-amount.util';
import { computePaymentStatusRollup } from './compute-payment-status-rollup.util';
import { CreateRefundDto } from './dto/create-refund.dto';

const SUBJECT_TABLE = 'refund';

/** Mirrors payment-service's own `refund-command-payloads.ts` — see that file's doc comment for the full "order-service approves, payment-service executes" split. Duplication is per-service by design, same convention as every other cross-service event contract in this repo. */
const REFUND_EXECUTE_COMMAND = 'payments.refund.execute';

/** The `notify.send` command contract (§0 gaps: notification-service doesn't exist yet — this is a payload-only command with no consumer today, verified by tailing the topic). */
const NOTIFY_SEND_COMMAND = 'notify.send';

/**
 * `create()`/`approve()`/`decline()` are the only places a refund's
 * persisted state moves — every one writes `activity_log` + an outbox
 * event on `orders/refund.events`. `approve()` additionally publishes the
 * `payments.refund.execute` command onto payment-service's own command
 * topic via the outbox's explicit `topic` override
 * (`OutboxMessage.topic`) — a command is still an at-least-once
 * obligation, so it goes through the same transactional-outbox mechanism
 * as every domain event, not a direct publish from the request handler.
 */
@Injectable()
export class RefundsService {
  constructor(
    @InjectRepository(Refund) private readonly repo: Repository<Refund>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(ReturnRequest) private readonly returnRepo: Repository<ReturnRequest>,
    private readonly config: ConfigService,
    private readonly returns: ReturnsService,
  ) {}

  async create(storeId: string, orderId: string, dto: CreateRefundDto): Promise<Refund> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    const ownedOrder = assertOwnedByStore(order, storeId, () => new NotFoundException(`Order ${orderId} not found`));

    let returnRequest: ReturnRequest | null = null;
    if (dto.returnId) {
      const found = await this.returnRepo.findOne({ where: { id: dto.returnId }, relations: { order: true } });
      const ownedReturn = assertOwnedByStore(
        found,
        storeId,
        () => new NotFoundException(`Return ${dto.returnId} not found`),
      );
      if (ownedReturn.order.id !== ownedOrder.id) {
        throw new BadRequestException(`Return ${dto.returnId} does not belong to order ${orderId}`);
      }
      returnRequest = ownedReturn;
    }

    // Not coerced to 0 before validating — a caller sending refundType:
    // 'none' with a non-zero amountMinor is a real, rejectable mistake
    // (data-model rule 4), not something to silently normalize away. Only
    // once assertRefundAmount confirms it's legal do we know amountMinor is
    // really 0 for this branch.
    const amountMinor = dto.amountMinor ?? 0;
    const priorRefundsMinor = await this.sumPriorRefunds(orderId);

    const check = assertRefundAmount({
      refundType: dto.refundType,
      amountMinor,
      orderTotalMinor: ownedOrder.totalMinor,
      priorRefundsMinor,
    });
    if (check.ok === false) {
      throw new BadRequestException(
        check.reason === 'INVALID_FOR_NONE'
          ? `refundType 'none' requires amountMinor to be 0`
          : `Refund amount ${amountMinor} exceeds the remaining refundable balance (${ownedOrder.totalMinor - priorRefundsMinor})`,
      );
    }

    const refund = this.repo.create({
      storeId,
      order: ownedOrder,
      returnRequest,
      paymentId: ownedOrder.paymentId ?? null,
      refundType: dto.refundType,
      amountMinor,
      reason: dto.reason ?? null,
      messageToCustomer: dto.messageToCustomer ?? null,
      sendInfoToCustomer: dto.sendInfoToCustomer ?? true,
      status: RefundStatus.Requested,
    });

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(refund);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'refund.requested',
        data: { refundType: saved.refundType, amountMinor: saved.amountMinor },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.RefundRequested,
        storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /** `requested -> processing` + publishes the refund-execute command. Requires a `paymentId` — a refund can't execute against nothing (a goodwill refund with no succeeded payment yet isn't executable; decline it or wait). */
  async approve(storeId: string, id: string): Promise<Refund> {
    const refund = await this.findOne(storeId, id);
    if (refund.status !== RefundStatus.Requested) {
      throw new ConflictException(`Refund ${id} can only be approved from requested (current: ${refund.status})`);
    }
    if (!refund.paymentId) {
      throw new ConflictException(`Refund ${id} has no payment to execute against`);
    }

    refund.status = RefundStatus.Processing;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(refund);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'refund.approved',
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.RefundApproved,
        storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      await recordOutboxEvent(manager, {
        eventType: REFUND_EXECUTE_COMMAND,
        storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          refundId: saved.id,
          orderId: saved.order.id,
          paymentId: saved.paymentId,
          amountMinor: saved.amountMinor,
          reason: saved.reason ?? undefined,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'payments', 'payment'),
      });
      return saved;
    });
  }

  async decline(storeId: string, id: string, reason?: string): Promise<Refund> {
    const refund = await this.findOne(storeId, id);
    if (refund.status !== RefundStatus.Requested) {
      throw new ConflictException(`Refund ${id} can only be declined from requested (current: ${refund.status})`);
    }

    refund.status = RefundStatus.Declined;
    if (reason) refund.reason = reason;

    return this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(refund);
      await writeActivityLog(manager, {
        storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'refund.declined',
        data: { reason: saved.reason },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.RefundDeclined,
        storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });
      return saved;
    });
  }

  /**
   * Handles `payments.refund.succeeded` — `processing -> refunded`, rolls
   * the order's `paymentStatus` up to
   * `partially_refunded`/`refunded` (pure `computePaymentStatusRollup`),
   * completes the linked RMA's resolution gate if one exists, emits
   * `orders.refund.settled` + a `notify.send` "tell the customer" command.
   * Idempotent purely via the `status !== processing` state check — a
   * refund no longer `processing` (already settled, or a duplicate
   * delivery already handled) is a silent no-op, same mechanism as every
   * other terminal-state guard in this service.
   */
  async handleRefundSucceeded(refundId: string): Promise<void> {
    const refund = await this.repo.findOne({
      where: { id: refundId },
      relations: { order: true, returnRequest: true },
    });
    if (!refund || refund.status !== RefundStatus.Processing) return;

    await this.repo.manager.transaction(async (manager) => {
      refund.status = RefundStatus.Refunded;
      refund.refundedAt = new Date();
      const savedRefund = await manager.save(refund);

      const { sum } = await manager
        .createQueryBuilder(Refund, 'r')
        .select('COALESCE(SUM(r.amount_minor), 0)', 'sum')
        .where('r.order_id = :orderId', { orderId: refund.order.id })
        .andWhere('r.status = :status', { status: RefundStatus.Refunded })
        .getRawOne<{ sum: string }>();
      const settledMinor = Number(sum);

      const order = refund.order;
      order.paymentStatus = computePaymentStatusRollup(order.totalMinor, settledMinor);
      await manager.save(order);

      await writeActivityLog(manager, {
        storeId: refund.storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: savedRefund.id,
        verb: 'refund.settled',
        data: { amountMinor: savedRefund.amountMinor, orderPaymentStatus: order.paymentStatus },
      });
      await recordOutboxEvent(manager, {
        eventType: OrderEventType.RefundSettled,
        storeId: refund.storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: savedRefund.id,
        payload: this.toEventPayload(savedRefund),
      });
      await recordOutboxEvent(manager, {
        eventType: NOTIFY_SEND_COMMAND,
        storeId: refund.storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: savedRefund.id,
        payload: {
          template: 'refund',
          orderId: order.id,
          refundId: savedRefund.id,
          amountMinor: savedRefund.amountMinor,
          sendToCustomer: savedRefund.sendInfoToCustomer,
          message: savedRefund.messageToCustomer ?? null,
          // Additive enrichment for notification-service's Step 7 mapper —
          // this command has no consumer today, so nothing downstream
          // observed the gap until notification-service actually needed a
          // real recipient address to send to. Same "extend a producer's
          // payload additively when a real consumer needs it" precedent as
          // catalog's categoryName enrichment.
          email: order.contactEmail ?? null,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
      });
    });

    if (refund.returnRequest) {
      await this.returns.settleFromRefund(refund.storeId, refund.returnRequest.id);
    }
  }

  /**
   * Handles `payments.refund.failed` — the refund stays `processing` with
   * `failureReason` surfaced (data-model rule 4 has no distinct "failed"
   * status; a provider failure here is usually actionable by staff, not
   * necessarily final) and a `notify.send` staff-alert command is emitted.
   * The RMA, if any, stays untouched — still `approved`, open for staff to
   * retry the refund or decide otherwise.
   */
  async handleRefundFailed(refundId: string, failureReason?: string): Promise<void> {
    const refund = await this.repo.findOne({ where: { id: refundId }, relations: { order: true } });
    if (!refund || refund.status !== RefundStatus.Processing) return;

    refund.failureReason = failureReason ?? null;

    await this.repo.manager.transaction(async (manager) => {
      const saved = await manager.save(refund);
      await writeActivityLog(manager, {
        storeId: refund.storeId,
        subjectTable: SUBJECT_TABLE,
        subjectId: saved.id,
        verb: 'refund.failed',
        data: { failureReason: saved.failureReason },
      });
      await recordOutboxEvent(manager, {
        eventType: NOTIFY_SEND_COMMAND,
        storeId: refund.storeId,
        aggregateType: REFUND_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: {
          template: 'refund_failed_staff_alert',
          orderId: refund.order.id,
          refundId: saved.id,
          failureReason: saved.failureReason,
        },
        topic: topicForCommands(this.config.get<string>('PULSAR_TENANT', 'ecomiq'), 'marketing', 'notify'),
      });
    });
  }

  async findOne(storeId: string, id: string): Promise<Refund> {
    const entity = await this.repo.findOne({ where: { id }, relations: { order: true, returnRequest: true } });
    return assertOwnedByStore(entity, storeId, () => new NotFoundException(`Refund ${id} not found`));
  }

  async listByOrder(storeId: string, orderId: string): Promise<Refund[]> {
    return this.repo.find({
      where: { storeId, order: { id: orderId } },
      order: { createdAt: 'ASC' },
    });
  }

  /** Sum of every non-declined refund already recorded against this order — the "prior refunds" side of the cumulative amount rule. */
  private async sumPriorRefunds(orderId: string): Promise<number> {
    const { sum } = await this.repo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.amount_minor), 0)', 'sum')
      .where('r.order_id = :orderId', { orderId })
      .andWhere('r.status != :declined', { declined: RefundStatus.Declined })
      .getRawOne<{ sum: string }>();
    return Number(sum);
  }

  private toEventPayload(refund: Refund): Record<string, unknown> {
    return {
      refundId: refund.id,
      storeId: refund.storeId,
      orderId: refund.order.id,
      returnId: refund.returnRequest?.id ?? null,
      paymentId: refund.paymentId,
      refundType: refund.refundType,
      amountMinor: refund.amountMinor,
      status: refund.status,
    };
  }
}
