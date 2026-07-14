import { IsEnum } from 'class-validator';
import { RefundType } from '../../entities/refund.entity';

/**
 * `refundType: 'none'` resolves immediately (nothing to wait for);
 * `full`/`partial` require this RMA's refund to have already settled
 * (`ReturnsService.resolve`'s own re-check) — in practice a
 * refund-carrying RMA is usually already `resolved` by the time this is
 * called manually, since `settleFromRefund()` does it automatically the
 * moment `payments.refund.succeeded` lands.
 */
export class ResolveReturnDto {
  @IsEnum(RefundType)
  refundType!: RefundType;
}
