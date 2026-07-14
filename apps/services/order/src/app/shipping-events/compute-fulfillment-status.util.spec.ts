import { computeFulfillmentStatus } from './compute-fulfillment-status.util';
import { FulfillmentStatus } from '../entities/order.entity';

describe('computeFulfillmentStatus', () => {
  it('is unfulfilled when nothing has shipped', () => {
    expect(computeFulfillmentStatus([{ qty: 2, fulfilledQty: 0 }])).toBe(FulfillmentStatus.Unfulfilled);
  });

  it('is unfulfilled for an order with no lines', () => {
    expect(computeFulfillmentStatus([])).toBe(FulfillmentStatus.Unfulfilled);
  });

  it('is partially_fulfilled once some but not all units have shipped', () => {
    expect(
      computeFulfillmentStatus([
        { qty: 2, fulfilledQty: 1 },
        { qty: 1, fulfilledQty: 0 },
      ]),
    ).toBe(FulfillmentStatus.PartiallyFulfilled);
  });

  it('is fulfilled once every line has caught up to its qty', () => {
    expect(
      computeFulfillmentStatus([
        { qty: 2, fulfilledQty: 2 },
        { qty: 1, fulfilledQty: 1 },
      ]),
    ).toBe(FulfillmentStatus.Fulfilled);
  });

  it('clamps an over-shipped line rather than treating it as more than 100% of the order', () => {
    expect(computeFulfillmentStatus([{ qty: 2, fulfilledQty: 5 }])).toBe(FulfillmentStatus.Fulfilled);
  });
});
