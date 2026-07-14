import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as pulsar from '@temp-nx/pulsar';
import { ShippingEventsController } from './shipping-events.controller';
import { Order, OrderStage, OrderStatus } from '../entities/order.entity';

jest.mock('@temp-nx/pulsar', () => ({
  recordOutboxEvent: jest.fn(),
}));

// `@Public` is a class-level metadata decorator, irrelevant to this
// method-level unit test — mocked to avoid pulling in `@temp-nx/auth`'s
// real `jwks-rsa` dependency, which is ESM-only and breaks ts-jest's
// CommonJS transform (a pre-existing repo gap, not something this test
// needs to exercise).
jest.mock('@temp-nx/auth', () => ({
  Public: () => () => undefined,
}));

describe('ShippingEventsController', () => {
  let controller: ShippingEventsController;
  let manager: { findOneBy: jest.Mock; update: jest.Mock };

  const makeOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: 'order-1',
      storeId: 'store-1',
      stage: OrderStage.ReviewOrder,
      status: OrderStatus.Open,
      shipmentDisplayId: null,
      ...overrides,
    } as Order);

  beforeEach(async () => {
    manager = { findOneBy: jest.fn(), update: jest.fn() };
    const orderRepo = {
      manager: { transaction: jest.fn((cb: (m: unknown) => unknown) => cb(manager)) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ShippingEventsController, { provide: getRepositoryToken(Order), useValue: orderRepo }],
    }).compile();

    controller = module.get(ShippingEventsController);
    jest.clearAllMocks();
  });

  describe('onShipmentUpdated', () => {
    it('ignores non-in_progress statuses entirely', async () => {
      await controller.onShipmentUpdated({
        shipmentId: 's1', storeId: 'store-1', displayId: 'SH-1', orderId: 'order-1',
        status: 'draft', currentStage: 0, contactEmail: null,
      });
      expect(manager.findOneBy).not.toHaveBeenCalled();
    });

    it('advances stage and captures shipmentDisplayId on first in_progress event', async () => {
      manager.findOneBy.mockResolvedValue(makeOrder());

      await controller.onShipmentUpdated({
        shipmentId: 's1', storeId: 'store-1', displayId: 'SH-1', orderId: 'order-1',
        status: 'in_progress', currentStage: 1, contactEmail: null,
      });

      expect(manager.update).toHaveBeenCalledWith(
        Order,
        { id: 'order-1' },
        { stage: OrderStage.Shipping, shipmentDisplayId: 'SH-1' },
      );
      expect(pulsar.recordOutboxEvent).toHaveBeenCalledTimes(1);
    });

    it('does not overwrite an already-set shipmentDisplayId', async () => {
      manager.findOneBy.mockResolvedValue(makeOrder({ stage: OrderStage.Shipping, shipmentDisplayId: 'SH-OLD' }));

      await controller.onShipmentUpdated({
        shipmentId: 's1', storeId: 'store-1', displayId: 'SH-NEW', orderId: 'order-1',
        status: 'in_progress', currentStage: 1, contactEmail: null,
      });

      // Stage already at Shipping and displayId already set — pure no-op.
      expect(manager.update).not.toHaveBeenCalled();
      expect(pulsar.recordOutboxEvent).not.toHaveBeenCalled();
    });

    it('backfills shipmentDisplayId on a late/redelivered event even when the stage does not move', async () => {
      manager.findOneBy.mockResolvedValue(makeOrder({ stage: OrderStage.Shipping, shipmentDisplayId: null }));

      await controller.onShipmentUpdated({
        shipmentId: 's1', storeId: 'store-1', displayId: 'SH-1', orderId: 'order-1',
        status: 'in_progress', currentStage: 1, contactEmail: null,
      });

      expect(manager.update).toHaveBeenCalledWith(Order, { id: 'order-1' }, { shipmentDisplayId: 'SH-1' });
      // No stage change -> no outbox event.
      expect(pulsar.recordOutboxEvent).not.toHaveBeenCalled();
    });
  });

  describe('onShipmentArrived', () => {
    it('skips canceled orders', async () => {
      manager.findOneBy.mockResolvedValue(makeOrder({ status: OrderStatus.Canceled }));

      await controller.onShipmentArrived({
        shipmentId: 's1', storeId: 'store-1', displayId: 'SH-1', orderId: 'order-1',
        status: 'arrived', currentStage: 3, contactEmail: null,
      });

      expect(manager.update).not.toHaveBeenCalled();
    });

    it('warns and no-ops on an unknown order id', async () => {
      manager.findOneBy.mockResolvedValue(null);

      await controller.onShipmentArrived({
        shipmentId: 's1', storeId: 'store-1', displayId: 'SH-1', orderId: 'missing-order',
        status: 'arrived', currentStage: 3, contactEmail: null,
      });

      expect(manager.update).not.toHaveBeenCalled();
    });
  });
});
