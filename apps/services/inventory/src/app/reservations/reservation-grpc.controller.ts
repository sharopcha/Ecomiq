import { ConflictException, Controller, NotFoundException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type { Metadata, ServerUnaryCall } from '@grpc/grpc-js';
import { GrpcInternalAuthGuard, Public, RequireInternalScope } from '@temp-nx/auth';
import {
  ReservationFailureReason,
  ReservationServiceController,
  ReservationServiceControllerMethods,
  ReserveStockRequest,
  ReserveStockResponse,
  ReleaseReservationRequest,
  ReleaseReservationResponse,
} from '@temp-nx/contracts';
import { ReservationsService } from './reservations.service';
import { StockLevelsService } from '../stock-levels/stock-levels.service';

/**
 * gRPC server side of `ecomiq.inventory.v1.ReservationService` — backs
 * order-service's checkout saga. Only translates proto <->
 * `ReservationsService`/`StockLevelsService`; all locking, the
 * negative-guard that turns "not enough stock" into a typed failure, and
 * outbox publishing already live in those services and aren't duplicated
 * here.
 *
 * `@Public()` + `@SkipThrottle()` at class level: this controller is wired
 * as a gRPC microservice (`Transport.GRPC` in main.ts), not an HTTP route,
 * but `JwtAuthGuard`/`ThrottlerGuard` are global `APP_GUARD`s in
 * app.module.ts and Nest runs global guards for every execution context.
 * `JwtAuthGuard` would call `context.switchToHttp().getRequest()` here and
 * throw on `undefined` for an RPC context — same gotcha
 * `CatalogSyncController` already documents and solves the same way. Auth
 * for this controller is `GrpcInternalAuthGuard` instead, applied
 * explicitly (client-credentials token in gRPC Metadata, not a user JWT).
 */
@Controller()
@Public()
@SkipThrottle()
@UseGuards(GrpcInternalAuthGuard)
@ReservationServiceControllerMethods()
export class ReservationGrpcController implements ReservationServiceController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly stockLevels: StockLevelsService,
  ) {}

  @RequireInternalScope('inventory:reserve')
  async reserveStock(
    request: ReserveStockRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<ReserveStockRequest, ReserveStockResponse>,
  ): Promise<ReserveStockResponse> {
    this.assertDeadlineNotExceeded(call);

    const resolved = await this.stockLevels.resolveForReservation(
      request.storeId,
      request.variantId,
      request.locationId,
    );
    // `resolved.ok === false` rather than `!resolved.ok` — this repo's
    // tsconfig.base.json doesn't set strictNullChecks, and without it
    // TypeScript's negation-based narrowing (`!x.ok`) on a boolean-literal
    // discriminant doesn't hold (confirmed in isolation: the discriminated
    // union itself is fine; only the `!`-negated check fails to narrow
    // under non-strict mode). The equality form narrows correctly either
    // way, so it's the safe pattern for this kind of union project-wide.
    if (resolved.ok === false) {
      return {
        failure: {
          reason:
            resolved.reason === 'VARIANT_NOT_FOUND'
              ? ReservationFailureReason.VARIANT_NOT_FOUND
              : ReservationFailureReason.LOCATION_NOT_FOUND,
          message:
            resolved.reason === 'VARIANT_NOT_FOUND'
              ? `Variant ${request.variantId} not found for this store`
              : `No stock level available for variant ${request.variantId}` +
                (request.locationId ? ` at location ${request.locationId}` : ''),
        },
      };
    }

    try {
      // proto3 scalars default to "" when unset (no `optional` keyword on
      // these two, unlike location_id) — normalize back to "absent" for the
      // DB layer, matching CreateReservationDto's `?: string` semantics.
      const { reservation } = await this.reservations.createIdempotent(request.storeId, {
        stockLevelId: resolved.stockLevel.id,
        qty: request.qty,
        orderId: request.orderId || undefined,
        orderLineId: request.orderLineId || undefined,
        idempotencyKey: request.idempotencyKey,
      });
      return {
        reserved: {
          reservationId: reservation.id,
          reservedUntil: reservation.reservedUntil,
        },
      };
    } catch (err) {
      // StockMovementsService.record()'s negative-guard surfaces as this —
      // the one business-rule failure this contract types explicitly.
      if (err instanceof ConflictException) {
        return {
          failure: {
            reason: ReservationFailureReason.INSUFFICIENT_STOCK,
            message: err.message,
          },
        };
      }
      throw err;
    }
  }

  @RequireInternalScope('inventory:release')
  async releaseReservation(
    request: ReleaseReservationRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<ReleaseReservationRequest, ReleaseReservationResponse>,
  ): Promise<ReleaseReservationResponse> {
    this.assertDeadlineNotExceeded(call);

    try {
      const reservation = await this.reservations.releaseIdempotent(
        request.storeId,
        request.reservationId,
      );
      return {
        released: {
          reservationId: reservation.id,
          // releaseIdempotent() only returns normally once releasedAt is
          // set (either just now, or already set on an idempotent replay);
          // the fallback is defensive, not an expected path.
          releasedAt: reservation.releasedAt ?? new Date(),
        },
      };
    } catch (err) {
      // Genuinely missing/wrong-store reservation — a real gRPC error, not
      // a typed business-rule failure (see this file's class doc comment).
      // Must be a real `RpcException` — Nest's `BaseRpcExceptionFilter`
      // discards the code/message of any plain thrown object and replaces
      // it with a generic "Internal server error" (verified against
      // node_modules/@nestjs/microservices/exceptions/base-rpc-exception-filter.js).
      if (err instanceof NotFoundException) {
        throw new RpcException({ code: status.NOT_FOUND, message: err.message });
      }
      throw err;
    }
  }

  /**
   * Honors the caller's deadline (ADR-7's sync saga calls are meant to fail
   * fast, not pile up behind a slow inventory-service) — aborts before doing
   * any work if the deadline has already passed by the time this handler
   * runs. `getDeadline()` returns `Infinity` when the caller set none, so
   * this is a no-op in that case.
   */
  private assertDeadlineNotExceeded(call?: { getDeadline(): Date | number }): void {
    const deadline = call?.getDeadline?.();
    if (deadline === undefined) return;
    const deadlineMs = deadline instanceof Date ? deadline.getTime() : deadline;
    if (Number.isFinite(deadlineMs) && deadlineMs <= Date.now()) {
      throw new RpcException({
        code: status.DEADLINE_EXCEEDED,
        message: 'Deadline already passed before processing started',
      });
    }
  }
}
