import { forwardStage } from './forward-stage.util';
import { OrderStage } from '../entities/order.entity';

describe('forwardStage', () => {
  it('advances forward to the target', () => {
    expect(forwardStage(OrderStage.PreparingOrder, OrderStage.Shipping)).toBe(OrderStage.Shipping);
  });

  it('never regresses a stage already past the target', () => {
    expect(forwardStage(OrderStage.Delivered, OrderStage.Shipping)).toBe(OrderStage.Delivered);
  });

  it('is a no-op when already at the target (idempotent on redelivery)', () => {
    expect(forwardStage(OrderStage.Shipping, OrderStage.Shipping)).toBe(OrderStage.Shipping);
  });

  it('can skip stages when a shipment jumps straight to delivered', () => {
    expect(forwardStage(OrderStage.ReviewOrder, OrderStage.Delivered)).toBe(OrderStage.Delivered);
  });
});
