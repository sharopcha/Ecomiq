import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { assertOwnedByStore } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { PaymentProviderPort } from '../provider/payment-provider.port';
import { PAYMENT_AGGREGATE_TYPE, PaymentEventType } from '../events/payment-event-types';
import { CreateIntentDto } from './dto/create-intent.dto';

const UNIQUE_VIOLATION = '23505';

/**
 * Carries the `PaymentProviderPort` result's typed `reason` alongside the
 * usual `BadRequestException` — added so `payment-grpc.controller.ts`
 * can map it onto the proto's `PaymentIntentFailureReason` oneof member
 * precisely, instead of guessing from a generic 400. The REST
 * `IntentsController` is unaffected (this still `instanceof BadRequestException`,
 * so Nest's default exception filter handles it identically to before).
 */
export class PaymentProviderRejectedException extends BadRequestException {
  constructor(
    public readonly reason: 'INVALID_AMOUNT' | 'PROVIDER_UNAVAILABLE',
    message: string,
  ) {
    super(message);
  }
}

/**
 * `createIntent()` is the checkout saga's entry point (ADR-7):
 * idempotencyKey-guarded so a retried gRPC call (network blip,
 * saga resume-after-crash) never double-creates an intent against the
 * provider. Deliberately does **not** pre-check with a `SELECT` before
 * inserting — just attempts the insert, and if the unique index on
 * `idempotency_key` rejects it, fetches and returns the row the winner of
 * that race already created. One fewer round-trip than inventory's
 * `Reservation.createIdempotent`, which does pre-check *and* catch (this
 * repo's two idempotency patterns are both valid — this is the other one).
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    private readonly provider: PaymentProviderPort,
  ) {}

  async createIntent(
    storeId: string,
    dto: CreateIntentDto,
  ): Promise<{ created: boolean; payment: Payment }> {
    if (!dto.idempotencyKey) {
      return { created: true, payment: await this.createCore(storeId, dto) };
    }

    try {
      const payment = await this.createCore(storeId, dto);
      return { created: true, payment };
    } catch (err) {
      if (!this.isUniqueViolation(err)) throw err;

      const existing = await this.repo.findOneBy({ idempotencyKey: dto.idempotencyKey });
      if (!existing) throw err; // lost the race but the winner's row is somehow gone — surface the original error
      assertOwnedByStore(
        existing,
        storeId,
        () =>
          new ConflictException(
            `Idempotency key ${dto.idempotencyKey} was already used by a different store`,
          ),
      );
      return { created: false, payment: existing };
    }
  }

  private async createCore(storeId: string, dto: CreateIntentDto): Promise<Payment> {
    const currency = dto.currency ?? 'USD';
    const result = await this.provider.createIntent({
      storeId,
      orderId: dto.orderId,
      amountMinor: dto.amountMinor,
      currency,
      idempotencyKey: dto.idempotencyKey,
      metadata: dto.metadata,
    });

    // `=== false` narrowing only — repo rule (tsconfig.base.json has no strictNullChecks).
    if (result.ok === false) {
      throw new PaymentProviderRejectedException(result.reason, result.message);
    }

    return this.repo.manager.transaction(async (manager) => {
      const payment = manager.create(Payment, {
        storeId,
        orderId: dto.orderId,
        provider: this.provider.name,
        amountMinor: dto.amountMinor,
        currency,
        status: PaymentStatus.Pending,
        externalRef: result.externalRef,
        clientSecret: result.clientSecret,
        idempotencyKey: dto.idempotencyKey ?? null,
      });
      const saved = await manager.save(payment);

      await recordOutboxEvent(manager, {
        eventType: PaymentEventType.PaymentCreated,
        storeId,
        aggregateType: PAYMENT_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved),
      });

      return saved;
    });
  }

  /** Only a still-`pending` intent can be canceled — nothing to cancel once a webhook has already settled it. */
  async cancelIntent(storeId: string, id: string): Promise<Payment> {
    return this.repo.manager.transaction(async (manager) => {
      const payment = await manager
        .createQueryBuilder(Payment, 'p')
        .setLock('pessimistic_write', undefined, ['p'])
        .where('p.id = :id', { id })
        .getOne();

      const owned = assertOwnedByStore(
        payment,
        storeId,
        () => new NotFoundException(`Payment ${id} not found`),
      );

      if (owned.status !== PaymentStatus.Pending) {
        throw new ConflictException(
          `Payment ${id} cannot be canceled from status ${owned.status}`,
        );
      }

      if (owned.externalRef) {
        const result = await this.provider.cancelIntent(owned.externalRef);
        if (result.ok === false && result.reason !== 'ALREADY_CANCELED') {
          throw new BadRequestException(result.message);
        }
      }

      owned.status = PaymentStatus.Canceled;
      await manager.save(owned);

      await recordOutboxEvent(manager, {
        eventType: PaymentEventType.PaymentCanceled,
        storeId,
        aggregateType: PAYMENT_AGGREGATE_TYPE,
        aggregateId: owned.id,
        payload: this.toEventPayload(owned),
      });

      return owned;
    });
  }

  /**
   * The gRPC `CancelPaymentIntent` entry point — `cancelIntent()`'s
   * `ConflictException` for "not pending" is exactly right for a direct
   * REST call, but wrong for a saga compensating step that may legitimately
   * be retried (ADR-7's compensation table explicitly says "ignore
   * ALREADY_CANCELED"). Same idempotent-wrapper pattern as inventory's
   * `ReservationsService.releaseIdempotent` — an already-canceled payment
   * is success, not error; any other conflict (e.g. already paid) still
   * throws, since that's a genuine saga-visible problem.
   */
  async cancelIntentIdempotent(storeId: string, id: string): Promise<{ payment: Payment; alreadyCanceled: boolean }> {
    try {
      const payment = await this.cancelIntent(storeId, id);
      return { payment, alreadyCanceled: false };
    } catch (err) {
      if (err instanceof ConflictException) {
        const existing = await this.getById(storeId, id);
        if (existing.status === PaymentStatus.Canceled) {
          return { payment: existing, alreadyCanceled: true };
        }
      }
      throw err;
    }
  }

  async getById(storeId: string, id: string): Promise<Payment> {
    const payment = await this.repo.findOneBy({ id });
    return assertOwnedByStore(
      payment,
      storeId,
      () => new NotFoundException(`Payment ${id} not found`),
    );
  }

  async listByOrder(storeId: string, orderId: string): Promise<Payment[]> {
    return this.repo.find({ where: { storeId, orderId }, order: { createdAt: 'DESC' } });
  }

  private toEventPayload(payment: Payment): Record<string, unknown> {
    return {
      paymentId: payment.id,
      storeId: payment.storeId,
      orderId: payment.orderId,
      provider: payment.provider,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      status: payment.status,
      externalRef: payment.externalRef,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
