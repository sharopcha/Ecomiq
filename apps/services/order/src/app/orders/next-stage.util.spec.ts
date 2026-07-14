import { OrderStage } from '../entities/order.entity';
import { nextStage } from './next-stage.util';

describe('nextStage', () => {
  it.each([
    [OrderStage.ReviewOrder, OrderStage.PreparingOrder],
    [OrderStage.PreparingOrder, OrderStage.Shipping],
    [OrderStage.Shipping, OrderStage.Delivered],
  ])('advances %s to %s', (current, expected) => {
    const result = nextStage(current);
    expect(result.ok).toBe(true);
    expect(result.ok === true && result.stage).toBe(expected);
  });

  it('refuses to advance past the final stage', () => {
    const result = nextStage(OrderStage.Delivered);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('ALREADY_AT_FINAL_STAGE');
  });
});
