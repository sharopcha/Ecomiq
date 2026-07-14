import { RefundType } from '../entities/refund.entity';
import { assertRefundAmount } from './assert-refund-amount.util';

describe('assertRefundAmount', () => {
  it('accepts refundType=none with amountMinor=0', () => {
    const result = assertRefundAmount({
      refundType: RefundType.None,
      amountMinor: 0,
      orderTotalMinor: 10000,
      priorRefundsMinor: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects refundType=none with a non-zero amount', () => {
    const result = assertRefundAmount({
      refundType: RefundType.None,
      amountMinor: 1,
      orderTotalMinor: 10000,
      priorRefundsMinor: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('INVALID_FOR_NONE');
  });

  it('accepts exactly the remaining amount', () => {
    const result = assertRefundAmount({
      refundType: RefundType.Full,
      amountMinor: 10000,
      orderTotalMinor: 10000,
      priorRefundsMinor: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects one minor unit over the remaining amount', () => {
    const result = assertRefundAmount({
      refundType: RefundType.Full,
      amountMinor: 10001,
      orderTotalMinor: 10000,
      priorRefundsMinor: 0,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('EXCEEDS_REMAINING');
  });

  it('cumulates multiple partial refunds against the same remaining balance', () => {
    const first = assertRefundAmount({
      refundType: RefundType.Partial,
      amountMinor: 4000,
      orderTotalMinor: 10000,
      priorRefundsMinor: 0,
    });
    expect(first.ok).toBe(true);

    const second = assertRefundAmount({
      refundType: RefundType.Partial,
      amountMinor: 6000,
      orderTotalMinor: 10000,
      priorRefundsMinor: 4000,
    });
    expect(second.ok).toBe(true);

    const third = assertRefundAmount({
      refundType: RefundType.Partial,
      amountMinor: 1,
      orderTotalMinor: 10000,
      priorRefundsMinor: 10000,
    });
    expect(third.ok).toBe(false);
    expect(third.ok === false && third.reason).toBe('EXCEEDS_REMAINING');
  });
});
