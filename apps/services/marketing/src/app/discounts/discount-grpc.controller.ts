import { Controller, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import type { Metadata, ServerUnaryCall } from '@grpc/grpc-js';
import { GrpcInternalAuthGuard, Public, RequireInternalScope } from '@temp-nx/auth';
import {
  DiscountKind as ProtoDiscountKind,
  DiscountServiceController,
  DiscountServiceControllerMethods,
  DiscountValidationFailureReason,
  ValidateDiscountRequest,
  ValidateDiscountResponse,
} from '@temp-nx/contracts';
import { DiscountKind } from '../entities/discount.entity';
import { DiscountsService } from './discounts.service';
import { ValidateDiscountReason, validateDiscount } from './validate-discount.util';

const KIND_TO_PROTO: Record<DiscountKind, ProtoDiscountKind> = {
  [DiscountKind.Percentage]: ProtoDiscountKind.PERCENTAGE,
  [DiscountKind.FixedAmount]: ProtoDiscountKind.FIXED_AMOUNT,
  [DiscountKind.FreeShipping]: ProtoDiscountKind.FREE_SHIPPING,
};

const REASON_TO_PROTO: Record<ValidateDiscountReason, DiscountValidationFailureReason> = {
  NOT_FOUND: DiscountValidationFailureReason.NOT_FOUND,
  INACTIVE: DiscountValidationFailureReason.INACTIVE,
  NOT_STARTED: DiscountValidationFailureReason.NOT_STARTED,
  EXPIRED: DiscountValidationFailureReason.EXPIRED,
  USAGE_LIMIT_REACHED: DiscountValidationFailureReason.USAGE_LIMIT_REACHED,
  ONCE_PER_CUSTOMER: DiscountValidationFailureReason.ONCE_PER_CUSTOMER,
  MIN_SUBTOTAL_NOT_MET: DiscountValidationFailureReason.MIN_SUBTOTAL_NOT_MET,
};

const REASON_MESSAGES: Record<ValidateDiscountReason, string> = {
  NOT_FOUND: 'No discount found for this code',
  INACTIVE: 'Discount is not active',
  NOT_STARTED: 'Discount is not active yet',
  EXPIRED: 'Discount has expired',
  USAGE_LIMIT_REACHED: 'Discount has reached its usage limit',
  ONCE_PER_CUSTOMER: 'This customer has already used this discount',
  MIN_SUBTOTAL_NOT_MET: 'Subtotal does not meet the discount minimum',
};

/**
 * gRPC server side of `ecomiq.marketing.v1.DiscountService` — backs
 * order-service's checkout saga. Purely a proto <->
 * `validate-discount.util.ts` translation layer: looks up the discount
 * and the calling customer's prior usage count, then delegates the
 * actual rule evaluation to the same pure function a future REST
 * validation endpoint would use. Same class-level wiring as inventory's
 * `ReservationGrpcController`/payment's `PaymentGrpcController`
 * (`@Public()` + `@SkipThrottle()` for the non-HTTP execution context;
 * `GrpcInternalAuthGuard`, shared across services).
 *
 * **Read-only** — deliberately never touches `DiscountUsage` or
 * `usageCount`. Recording usage happens only on `orders.order.placed`: a
 * checkout that validates a code and then abandons before paying must
 * not have burned it.
 */
@Controller()
@Public()
@SkipThrottle()
@UseGuards(GrpcInternalAuthGuard)
@DiscountServiceControllerMethods()
export class DiscountGrpcController implements DiscountServiceController {
  constructor(private readonly discounts: DiscountsService) {}

  @RequireInternalScope('marketing:validate_discount')
  async validateDiscount(
    request: ValidateDiscountRequest,
    _metadata?: Metadata,
    call?: ServerUnaryCall<ValidateDiscountRequest, ValidateDiscountResponse>,
  ): Promise<ValidateDiscountResponse> {
    this.assertDeadlineNotExceeded(call);

    const discount = await this.discounts.findByCode(request.storeId, request.code);
    const priorCustomerUsageCount =
      discount && request.customerId
        ? await this.discounts.countCustomerUsage(discount.id, request.customerId)
        : 0;

    const result = validateDiscount(discount, {
      now: new Date(),
      customerId: request.customerId,
      subtotalMinor: request.subtotalMinor,
      priorCustomerUsageCount,
    });

    // `=== false` narrowing only — repo rule.
    if (result.valid === false) {
      return {
        failure: {
          reason: REASON_TO_PROTO[result.reason],
          message: REASON_MESSAGES[result.reason],
        },
      };
    }

    // `discount` is guaranteed non-null here: validateDiscount's very first
    // check returns `{ valid: false, reason: 'NOT_FOUND' }` whenever it's
    // null, so reaching `valid === true` means it wasn't.
    return {
      valid: {
        discountId: discount!.id,
        discountMinor: result.discountMinor,
        kind: KIND_TO_PROTO[discount!.kind],
      },
    };
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
