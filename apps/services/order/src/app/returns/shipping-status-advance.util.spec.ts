import { ReturnShipping } from '../entities/return-request.entity';
import { advanceShippingStatus } from './shipping-status-advance.util';

describe('advanceShippingStatus', () => {
  it.each([
    [ReturnShipping.None, ReturnShipping.Sending],
    [ReturnShipping.Sending, ReturnShipping.Delivered],
    [ReturnShipping.Delivered, ReturnShipping.Received],
  ])('advances %s to %s', (current, expected) => {
    const result = advanceShippingStatus(current);
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.status).toBe(expected);
  });

  it('refuses to advance past received', () => {
    const result = advanceShippingStatus(ReturnShipping.Received);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('ALREADY_RECEIVED');
  });
});
