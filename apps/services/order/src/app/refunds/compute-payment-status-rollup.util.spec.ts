import { OrderPaymentStatus } from '../entities/order.entity';
import { computePaymentStatusRollup } from './compute-payment-status-rollup.util';

describe('computePaymentStatusRollup', () => {
  it('returns refunded once settled refunds cover the full total', () => {
    expect(computePaymentStatusRollup(10000, 10000)).toBe(OrderPaymentStatus.Refunded);
  });

  it('returns refunded if settled refunds somehow exceed the total (never expected, still safe)', () => {
    expect(computePaymentStatusRollup(10000, 10001)).toBe(OrderPaymentStatus.Refunded);
  });

  it('returns partially_refunded for a partial settlement', () => {
    expect(computePaymentStatusRollup(10000, 4000)).toBe(OrderPaymentStatus.PartiallyRefunded);
  });
});
