import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { Order, OrderPaymentStatus, OrderStatus, FulfillmentStatus } from '../entities/order.entity';
import { OrderLine } from '../entities/order-line.entity';
import { SagaState, SagaStatus } from '../entities/saga-state.entity';
import { CheckoutSagaOrchestrator } from '../checkout/saga/checkout-saga.orchestrator';
import { ComposeOrderDto } from './dto/compose-order.dto';

describe('StorefrontService', () => {
  let service: StorefrontService;
  let orchestrator: CheckoutSagaOrchestrator;
  let dataSource: DataSource;

  const mockOrderRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const mockOrderLineRepo = {
    find: jest.fn(),
  };

  const mockSagaStateRepo = {
    findOne: jest.fn(),
  };

  const mockOrchestrator = {
    start: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
  };

  const mockTransactionManager = {
    create: jest.fn().mockImplementation((entity, data) => ({ id: 'mock-id', ...data })),
    save: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn().mockImplementation(async (cb) => {
      return cb(mockTransactionManager);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderLine), useValue: mockOrderLineRepo },
        { provide: getRepositoryToken(SagaState), useValue: mockSagaStateRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: CheckoutSagaOrchestrator, useValue: mockOrchestrator },
      ],
    }).compile();

    service = module.get<StorefrontService>(StorefrontService);
    orchestrator = module.get<CheckoutSagaOrchestrator>(CheckoutSagaOrchestrator);
    dataSource = module.get<DataSource>(DataSource);

    // Mock global fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should compose split orders for multiple stores', async () => {
    const dto: ComposeOrderDto = {
      lines: [
        { variantId: 'v1', qty: 1, expectedPriceMinor: 1000 },
        { variantId: 'v2', qty: 2, expectedPriceMinor: 2000 },
      ],
      shippingAddress: { city: 'Test' },
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        lines: [
          { variantId: 'v1', qty: 1, unitPriceMinor: 1000, storeId: 'store-1', problems: [] },
          { variantId: 'v2', qty: 2, unitPriceMinor: 2000, storeId: 'store-2', problems: [] },
        ],
        groups: [
          { storeId: 'store-1', lineVariantIds: ['v1'], subtotalMinor: 1000 },
          { storeId: 'store-2', lineVariantIds: ['v2'], subtotalMinor: 4000 },
        ],
      }),
    });

    const res = await service.composeOrder('customer-1', dto);

    expect(global.fetch).toHaveBeenCalled();
    expect(res.failedGroups).toHaveLength(0);
    expect(res.orders).toHaveLength(2);
    expect(res.orders[0].storeId).toBe('store-1');
    expect(res.orders[1].storeId).toBe('store-2');

    // Saga started for both
    expect(mockOrchestrator.start).toHaveBeenCalledTimes(2);
    expect(mockOrchestrator.start).toHaveBeenCalledWith('store-1', 'mock-id', null);
    expect(mockOrchestrator.start).toHaveBeenCalledWith('store-2', 'mock-id', null);
  });

  it('should throw when lines are empty', async () => {
    const dto: ComposeOrderDto = { lines: [], shippingAddress: {} };
    await expect(service.composeOrder('cust1', dto)).rejects.toThrow(UnprocessableEntityException);
  });

  it('should reject when catalog validation fails', async () => {
    const dto: ComposeOrderDto = {
      lines: [{ variantId: 'v1', qty: 1, expectedPriceMinor: 1000 }],
      shippingAddress: {},
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
    });

    await expect(service.composeOrder('cust1', dto)).rejects.toThrow('Failed to validate cart');
  });

  it('should return failedGroups when prices drift', async () => {
    const dto: ComposeOrderDto = {
      lines: [
        { variantId: 'v1', qty: 1, expectedPriceMinor: 1000 },
      ],
      shippingAddress: {},
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        lines: [
          { variantId: 'v1', qty: 1, unitPriceMinor: 2000, storeId: 'store-1', problems: [], name: 'Product V1' },
        ],
        groups: [
          { storeId: 'store-1', lineVariantIds: ['v1'], subtotalMinor: 2000 },
        ],
      }),
    });

    const res = await service.composeOrder('cust1', dto).catch(e => e.getResponse());
    
    expect(res.failedGroups).toHaveLength(1);
    expect(res.failedGroups[0].problems[0]).toContain('Price drift on variant Product V1: requested 1000, actual 2000');
  });

  describe('getOrderDetail', () => {
    const fakeOrder = {
      id: 'order-1',
      displayNumber: 42,
      storeId: 'store-1',
      status: OrderStatus.Open,
      fulfillmentStatus: FulfillmentStatus.Unfulfilled,
      paymentStatus: OrderPaymentStatus.Pending,
      totalMinor: 5000,
      currency: 'USD',
      orderDate: new Date('2026-01-01T00:00:00Z'),
      subtotalMinor: 5000,
      shippingFeeMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      shippingAddress: { city: 'Tashkent' },
      contactEmail: 'a@b.com',
      contactPhone: null,
      paymentId: null,
    } as unknown as Order;

    it('returns the order with lines when owned by the customer', async () => {
      mockOrderRepo.findOne.mockResolvedValue(fakeOrder);
      mockOrderLineRepo.find.mockResolvedValue([
        { id: 'line-1', variantId: 'v1', name: 'Widget', sku: null, variantLabel: null, qty: 1, fulfilledQty: 0, unitPriceMinor: 5000, imageFileId: null },
      ]);

      const result = await service.getOrderDetail('cust-1', 'order-1');

      expect(mockOrderRepo.findOne).toHaveBeenCalledWith({ where: { id: 'order-1', customerId: 'cust-1' } });
      expect(result.id).toBe('order-1');
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].name).toBe('Widget');
    });

    it('404s when the order is missing or not owned by the customer', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      await expect(service.getOrderDetail('cust-1', 'order-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOrderStatus', () => {
    const fakeOrder = {
      id: 'order-1',
      status: OrderStatus.Open,
      paymentStatus: OrderPaymentStatus.Pending,
    } as unknown as Order;

    it('returns saga + order status when a saga exists', async () => {
      mockOrderRepo.findOne.mockResolvedValue(fakeOrder);
      mockSagaStateRepo.findOne.mockResolvedValue({
        status: SagaStatus.Running,
        payload: { redirectUrl: 'https://pay.example.com/x' },
      });

      const result = await service.getOrderStatus('cust-1', 'order-1');

      expect(result).toEqual({
        sagaStatus: SagaStatus.Running,
        orderStatus: OrderStatus.Open,
        paymentState: OrderPaymentStatus.Pending,
        redirectUrl: 'https://pay.example.com/x',
      });
    });

    it('returns a null sagaStatus/redirectUrl when no saga is found', async () => {
      mockOrderRepo.findOne.mockResolvedValue(fakeOrder);
      mockSagaStateRepo.findOne.mockResolvedValue(null);

      const result = await service.getOrderStatus('cust-1', 'order-1');

      expect(result.sagaStatus).toBeNull();
      expect(result.redirectUrl).toBeNull();
    });

    it('404s when the order is missing or not owned by the customer', async () => {
      mockOrderRepo.findOne.mockResolvedValue(null);
      await expect(service.getOrderStatus('cust-1', 'order-1')).rejects.toThrow(NotFoundException);
    });
  });
});
