import { ConflictException, Controller, NotFoundException, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type { Metadata, ServerUnaryCall } from '@grpc/grpc-js';
import { GrpcInternalAuthGuard, Public, RequireInternalScope } from '@temp-nx/auth';
import {
  CancelPaymentIntentRequest,
  CancelPaymentIntentResponse,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  PaymentIntentFailureReason,
  PaymentIntentServiceController,
  PaymentIntentServiceControllerMethods,
} from '@temp-nx/contracts';
import { PaymentsService, PaymentProviderRejectedException } from './payments.service';

/**
 * gRPC server side of `ecomiq.payment.v1.PaymentIntentService` — backs
 * order-service's checkout saga. Only translates proto <-> `PaymentsService`;
 * all provider dispatch, idempotency, and outbox publishing already live
 * there and aren't duplicated here. Same class-level wiring as inventory's
 * `ReservationGrpcController` (`@Public()` + `@SkipThrottle()` since this
 * is a gRPC microservice context, not HTTP — the global `JwtAuthGuard`/
 * `ThrottlerGuard` would both throw trying to read an Express `Request`
 * that doesn't exist here; auth is `GrpcInternalAuthGuard` instead).
 */
@Controller()
@Public()
@SkipThrottle()
@UseGuards(GrpcInternalAuthGuard)
@PaymentIntentServiceControllerMethods()
export class PaymentGrpcController implements PaymentIntentServiceController {
  constructor(private readonly payments: PaymentsService) {}

  @RequireInternalScope('payments:create_intent')
  async createPaymentIntent(
    request: CreatePaymentIntentRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<CreatePaymentIntentRequest, CreatePaymentIntentResponse>,
  ): Promise<CreatePaymentIntentResponse> {
    this.assertDeadlineNotExceeded(call);

    try {
      const { payment } = await this.payments.createIntent(request.storeId, {
        orderId: request.orderId,
        amountMinor: request.amountMinor,
        currency: request.currency || undefined,
        idempotencyKey: request.idempotencyKey,
        metadata: request.metadata,
      });
      return {
        created: {
          paymentId: payment.id,
          externalRef: payment.externalRef ?? '',
          clientSecret: payment.clientSecret ?? '',
          status: payment.status,
        },
      };
    } catch (err) {
      // Business-rule outcomes the saga must branch on — a typed oneof
      // member, not a thrown gRPC error (see reservation-grpc.controller.ts's
      // doc comment for the same split).
      if (err instanceof PaymentProviderRejectedException) {
        return {
          failure: {
            reason:
              err.reason === 'INVALID_AMOUNT'
                ? PaymentIntentFailureReason.INVALID_AMOUNT
                : PaymentIntentFailureReason.PROVIDER_UNAVAILABLE,
            message: err.message,
          },
        };
      }
      if (err instanceof ConflictException) {
        // The only ConflictException createIntent() throws is the
        // cross-store idempotency-key collision — see its doc comment.
        return {
          failure: {
            reason: PaymentIntentFailureReason.DUPLICATE_IDEMPOTENCY_KEY_CONFLICT,
            message: err.message,
          },
        };
      }
      throw err;
    }
  }

  @RequireInternalScope('payments:cancel_intent')
  async cancelPaymentIntent(
    request: CancelPaymentIntentRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<CancelPaymentIntentRequest, CancelPaymentIntentResponse>,
  ): Promise<CancelPaymentIntentResponse> {
    this.assertDeadlineNotExceeded(call);

    try {
      const { payment, alreadyCanceled } = await this.payments.cancelIntentIdempotent(
        request.storeId,
        request.paymentId,
      );
      return {
        canceled: {
          paymentId: payment.id,
          alreadyCanceled,
        },
      };
    } catch (err) {
      // Genuinely missing payment — a real gRPC error, not a typed
      // business-rule failure (same distinction reservation-grpc.controller.ts
      // draws for NotFoundException). Must be RpcException, not a plain
      // object — BaseRpcExceptionFilter silently discards anything else
      // (repo rule).
      if (err instanceof NotFoundException) {
        throw new RpcException({ code: status.NOT_FOUND, message: err.message });
      }
      throw err;
    }
  }

  /** Honors the caller's deadline — same reasoning/implementation as reservation-grpc.controller.ts's. */
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
