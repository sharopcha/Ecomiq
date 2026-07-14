import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PaginatedResult, assertOwnedByStore, paginate } from '@temp-nx/typeorm';
import { recordOutboxEvent } from '@temp-nx/pulsar';
import { Reservation } from '../entities/reservation.entity';
import { StockLevel } from '../entities/stock-level.entity';
import { StockMovementKind } from '../entities/stock-movement.entity';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { InventoryEventType, RESERVATION_AGGREGATE_TYPE } from '../events/inventory-event-types';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { FindReservationsQueryDto } from './dto/find-reservations-query.dto';

/** "Reserve Item … secure it for 24 hours" — see Reservation's doc comment. */
const RESERVATION_HOLD_HOURS = 24;
const UNIQUE_VIOLATION = '23505';

/**
 * `create()`/`release()`/`expire()` are the only places a reservation's
 * lifecycle moves — all three call into `StockMovementsService.record()`
 * (passing this transaction's manager, same composition pattern as
 * StockAuditsService) so the reservation row and the `reserved` mutation
 * commit or roll back together, and each publishes its own
 * `inventory.reservation.*` event on the reservation's own aggregate stream
 * (see RESERVATION_AGGREGATE_TYPE's doc comment) in addition to the
 * `inventory.stock.adjusted` (and possibly `.stock.low`) events `record()`
 * itself already publishes on the stock_level stream.
 *
 * `create()` also schedules the auto-expiry: alongside
 * `.created`, it records a *second* outbox row —
 * `InventoryEventType.ReservationExpiryCheck` — with `deliverAt:
 * reservedUntil`. Pulsar holds that message invisible to every consumer
 * until that exact instant (a real delayed message, not a cron sweep, per
 * the earlier architecture decision — see this service's memory note); when
 * it finally arrives, `ReservationExpiryController` (a second PulsarServer
 * subscription on inventory's own namespace, wired in main.ts) calls
 * `expire()`. `expire()` is idempotent (guarded by the same
 * lock-then-check-`releasedAt` pattern as `release()`), so it's a safe
 * no-op if the reservation was already released explicitly (or, in the
 * vanishingly unlikely case of Pulsar redelivery, already expired) by the
 * time the delayed message finally arrives.
 */
@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation) private readonly repo: Repository<Reservation>,
    private readonly stockMovements: StockMovementsService,
  ) {}

  /** Locks the target stock_level, creates the hold, and increments `reserved` by `qty` via the ledger — `record()`'s own negative-guard means this naturally fails with a 409 if not enough is available to reserve. */
  async create(storeId: string, dto: CreateReservationDto): Promise<Reservation> {
    return this.createCore(storeId, {
      stockLevelId: dto.stockLevelId,
      qty: dto.qty,
      orderId: dto.orderId,
      orderLineId: dto.orderLineId,
    });
  }

  /**
   * The gRPC `ReserveStock` entry
   * point. Unlike `create()` (REST, no retry-safety needed — a human
   * clicking "Reserve" twice is two intentional reservations), this is
   * called by order-service's saga, which *will* retry the same logical
   * step on timeout/redelivery. Checks for an existing reservation with the
   * same `idempotencyKey` **before** taking any lock — a replayed call
   * returns the original reservation (`created: false`) instead of
   * double-reserving. Not itself inside the creation transaction: the
   * unique index on `idempotency_key` is the actual race-safety backstop
   * (a concurrent duplicate call that loses this pre-check race just hits
   * the constraint violation on insert instead — see the catch below).
   */
  async createIdempotent(
    storeId: string,
    params: {
      stockLevelId: string;
      qty: number;
      orderId?: string;
      orderLineId?: string;
      idempotencyKey: string;
    },
  ): Promise<{ created: boolean; reservation: Reservation }> {
    const existing = await this.repo.findOneBy({ idempotencyKey: params.idempotencyKey });
    if (existing) {
      assertOwnedByStore(
        existing,
        storeId,
        () =>
          new ConflictException(
            `Idempotency key ${params.idempotencyKey} was already used by a different store`,
          ),
      );
      return { created: false, reservation: existing };
    }

    try {
      const reservation = await this.createCore(storeId, params);
      return { created: true, reservation };
    } catch (err) {
      // Lost the race against a concurrent call with the same key — the
      // unique index rejected our insert. Fetch and return what the winner
      // created rather than surfacing a 409 for what is, from the caller's
      // perspective, a successful retry.
      if (this.isUniqueViolation(err)) {
        const winner = await this.repo.findOneBy({ idempotencyKey: params.idempotencyKey });
        if (winner) return { created: false, reservation: winner };
      }
      throw err;
    }
  }

  private async createCore(
    storeId: string,
    params: {
      stockLevelId: string;
      qty: number;
      orderId?: string | null;
      orderLineId?: string | null;
      idempotencyKey?: string;
    },
  ): Promise<Reservation> {
    return this.repo.manager.transaction(async (manager) => {
      const stockLevel = await manager
        .createQueryBuilder(StockLevel, 'sl')
        .leftJoinAndSelect('sl.location', 'location')
        .setLock('pessimistic_write', undefined, ['sl'])
        .where('sl.id = :id', { id: params.stockLevelId })
        .getOne();

      const owned = assertOwnedByStore(
        stockLevel,
        storeId,
        () => new NotFoundException(`Stock level ${params.stockLevelId} not found`),
      );

      const reservedUntil = new Date(Date.now() + RESERVATION_HOLD_HOURS * 60 * 60 * 1000);

      const reservation = manager.create(Reservation, {
        storeId,
        stockLevel: owned,
        orderId: params.orderId ?? null,
        orderLineId: params.orderLineId ?? null,
        qty: params.qty,
        reservedUntil,
        releasedAt: null,
        idempotencyKey: params.idempotencyKey ?? null,
      });
      const saved = await manager.save(reservation);

      await this.stockMovements.record(
        {
          storeId,
          stockLevelId: owned.id,
          kind: StockMovementKind.Reservation,
          qtyDelta: params.qty,
          refTable: 'reservation',
          refId: saved.id,
        },
        manager,
      );

      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.ReservationCreated,
        storeId,
        aggregateType: RESERVATION_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: this.toEventPayload(saved, owned),
      });

      // The self-consumed delayed trigger for auto-expiry — see this
      // class's doc comment. Deliberately a minimal payload (just the id):
      // ReservationExpiryController re-loads the reservation fresh when the
      // delayed message finally arrives, rather than trusting a 24h-stale
      // snapshot of its state.
      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.ReservationExpiryCheck,
        storeId,
        aggregateType: RESERVATION_AGGREGATE_TYPE,
        aggregateId: saved.id,
        payload: { reservationId: saved.id },
        deliverAt: reservedUntil,
      });

      return saved;
    });
  }

  /**
   * Explicit release — a merchant cancel, or (once order-service exists) a
   * fulfillment callback. Refuses a reservation that's already been
   * released (whether explicitly or, later, via auto-expiry) —
   * `releasedAt` is a one-way, terminal flip.
   *
   * Locks the *reservation* row itself (`setLock(..., ['r'])`, same
   * lock-scoped-to-one-alias pattern `StockMovementsService` uses) — without
   * this, two concurrent release calls for the same reservation could both
   * read `releasedAt: null` before either writes, and both proceed to
   * record a Release movement, double-decrementing `reserved`.
   */
  async release(storeId: string, id: string): Promise<Reservation> {
    return this.repo.manager.transaction(async (manager) => {
      const reservation = await manager
        .createQueryBuilder(Reservation, 'r')
        .leftJoinAndSelect('r.stockLevel', 'stockLevel')
        .leftJoinAndSelect('stockLevel.location', 'location')
        .setLock('pessimistic_write', undefined, ['r'])
        .where('r.id = :id', { id })
        .getOne();

      const owned = assertOwnedByStore(
        reservation,
        storeId,
        () => new NotFoundException(`Reservation ${id} not found`),
      );

      if (owned.releasedAt) {
        throw new ConflictException(`Reservation ${id} has already been released`);
      }

      owned.releasedAt = new Date();
      await manager.save(owned);

      await this.stockMovements.record(
        {
          storeId,
          stockLevelId: owned.stockLevel.id,
          kind: StockMovementKind.Release,
          qtyDelta: -owned.qty,
          refTable: 'reservation',
          refId: owned.id,
        },
        manager,
      );

      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.ReservationReleased,
        storeId,
        aggregateType: RESERVATION_AGGREGATE_TYPE,
        aggregateId: owned.id,
        payload: this.toEventPayload(owned, owned.stockLevel),
      });

      return owned;
    });
  }

  /**
   * The gRPC `ReleaseReservation` entry
   * point. `release()`'s "already released" `ConflictException` is exactly
   * right for a direct user action (the REST route) but wrong for a saga
   * compensating step that may legitimately be retried: the *reservation*
   * (not a request-scoped idempotency key — there's no new row being
   * created here, so a unique-constraint dedup doesn't apply) is already
   * naturally idempotent via `releasedAt`'s one-way terminal flip, so a
   * retried release just needs to observe "already done" as success, not
   * error. Not-found still throws — a retried call for a reservation that
   * genuinely doesn't exist is a real problem, not a benign replay.
   */
  async releaseIdempotent(storeId: string, id: string): Promise<Reservation> {
    try {
      return await this.release(storeId, id);
    } catch (err) {
      if (err instanceof ConflictException) {
        return this.findOne(storeId, id);
      }
      throw err;
    }
  }

  /**
   * The auto-expiry handler, invoked by `ReservationExpiryController` when the
   * `reservedUntil`-delayed Pulsar message finally arrives. Deliberately
   * **idempotent and side-effect-free on anything already resolved**:
   * Pulsar's at-least-once delivery means this can run more than once for
   * the same reservation (redelivery after a crash before ack, etc.), and
   * the normal case — the reservation was released long before the 24h
   * mark — must be a silent no-op, not an error. Never throws for "already
   * released"/"not found"/"wrong store"; those are all expected, not
   * exceptional, in an asynchronous delayed-message consumer (unlike
   * `release()`, which is a direct user action and *should* surface a 409
   * for an already-released reservation).
   *
   * Locks the reservation row exactly like `release()` does, for the same
   * double-release race reason.
   */
  async expire(storeId: string, id: string): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const reservation = await manager
        .createQueryBuilder(Reservation, 'r')
        .leftJoinAndSelect('r.stockLevel', 'stockLevel')
        .leftJoinAndSelect('stockLevel.location', 'location')
        .setLock('pessimistic_write', undefined, ['r'])
        .where('r.id = :id', { id })
        .getOne();

      if (!reservation || reservation.storeId !== storeId || reservation.releasedAt) {
        return;
      }

      reservation.releasedAt = new Date();
      await manager.save(reservation);

      await this.stockMovements.record(
        {
          storeId,
          stockLevelId: reservation.stockLevel.id,
          kind: StockMovementKind.Release,
          qtyDelta: -reservation.qty,
          refTable: 'reservation',
          refId: reservation.id,
        },
        manager,
      );

      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.ReservationExpired,
        storeId,
        aggregateType: RESERVATION_AGGREGATE_TYPE,
        aggregateId: reservation.id,
        payload: this.toEventPayload(reservation, reservation.stockLevel),
      });
    });
  }

  /**
   * `ReservationsService` had no way to convert a hold into a completed
   * sale until this method — the one sanctioned extension to this service's
   * existing logic, added when order-service's checkout saga needed it.
   * Invoked by inventory-service's own `orders.order.placed`
   * consumer once order-service's checkout saga's payment has succeeded.
   *
   * Two `StockMovement` rows in one transaction — `release` (undoes the
   * hold on `reserved`) then `sale` (the real `on_hand` decrement) — rather
   * than a single combined movement, because `StockMovement.kind` already
   * has separate `release`/`sale` members with distinct semantics
   * (`targetFieldForKind`) and every other movement in this ledger is
   * one-kind-per-row; splitting it in two keeps "Stock History" reading the
   * same way a manual release-then-fulfill would.
   *
   * Idempotent and side-effect-free on anything already resolved — same
   * `releasedAt`-flip-decides-idempotency reasoning as `expire()`, since
   * this is also an asynchronous consumer that Pulsar's at-least-once
   * delivery can invoke more than once for the same reservation.
   */
  async commit(storeId: string, id: string): Promise<void> {
    await this.repo.manager.transaction(async (manager) => {
      const reservation = await manager
        .createQueryBuilder(Reservation, 'r')
        .leftJoinAndSelect('r.stockLevel', 'stockLevel')
        .leftJoinAndSelect('stockLevel.location', 'location')
        .setLock('pessimistic_write', undefined, ['r'])
        .where('r.id = :id', { id })
        .getOne();

      if (!reservation || reservation.storeId !== storeId || reservation.releasedAt) {
        return;
      }

      reservation.releasedAt = new Date();
      await manager.save(reservation);

      await this.stockMovements.record(
        {
          storeId,
          stockLevelId: reservation.stockLevel.id,
          kind: StockMovementKind.Release,
          qtyDelta: -reservation.qty,
          refTable: 'reservation',
          refId: reservation.id,
        },
        manager,
      );

      await this.stockMovements.record(
        {
          storeId,
          stockLevelId: reservation.stockLevel.id,
          kind: StockMovementKind.Sale,
          qtyDelta: -reservation.qty,
          refTable: 'reservation',
          refId: reservation.id,
        },
        manager,
      );

      await recordOutboxEvent(manager, {
        eventType: InventoryEventType.ReservationCommitted,
        storeId,
        aggregateType: RESERVATION_AGGREGATE_TYPE,
        aggregateId: reservation.id,
        payload: this.toEventPayload(reservation, reservation.stockLevel),
      });
    });
  }

  async findOne(storeId: string, id: string): Promise<Reservation> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: { stockLevel: { location: true } },
    });
    return assertOwnedByStore(
      entity,
      storeId,
      () => new NotFoundException(`Reservation ${id} not found`),
    );
  }

  /** Reservation history for a cell, a variant (across warehouses), or an order. */
  async list(
    storeId: string,
    query: FindReservationsQueryDto,
  ): Promise<PaginatedResult<Reservation>> {
    if (!query.stockLevelId && !query.variantId && !query.orderId) {
      throw new BadRequestException('stockLevelId, variantId, or orderId is required');
    }

    const qb = this.repo
      .createQueryBuilder('r')
      .innerJoin('r.stockLevel', 'sl')
      .where('r.store_id = :storeId', { storeId });

    if (query.stockLevelId) {
      qb.andWhere('sl.id = :stockLevelId', { stockLevelId: query.stockLevelId });
    }
    if (query.variantId) {
      qb.andWhere('sl.variant_id = :variantId', { variantId: query.variantId });
    }
    if (query.orderId) {
      qb.andWhere('r.order_id = :orderId', { orderId: query.orderId });
    }

    return paginate(qb, 'r', query);
  }

  private toEventPayload(reservation: Reservation, stockLevel: StockLevel): Record<string, unknown> {
    return {
      reservationId: reservation.id,
      stockLevelId: stockLevel.id,
      variantId: stockLevel.variantId,
      locationId: stockLevel.location.id,
      qty: reservation.qty,
      orderId: reservation.orderId,
      orderLineId: reservation.orderLineId,
      reservedUntil: reservation.reservedUntil,
      releasedAt: reservation.releasedAt,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as unknown as { code?: string }).code === UNIQUE_VIOLATION
    );
  }
}
