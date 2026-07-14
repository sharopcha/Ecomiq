import {
  DiscountValidationFailureReason,
  PaymentIntentFailureReason,
  ReservationFailureReason,
  createInventoryGrpcClient,
  createMarketingGrpcClient,
  createPaymentGrpcClient,
} from '@temp-nx/contracts';
import { CheckoutSagaPorts } from './checkout-saga-ports';

export interface GrpcCheckoutPortsConfig {
  inventoryUrl: string;
  paymentUrl: string;
  marketingUrl: string;
  /** Same `getToken` contract every `create*GrpcClient` factory expects — pass `InternalTokenClient.getToken.bind(client)` (from `@temp-nx/auth`). */
  getToken: () => string | Promise<string>;
}

/**
 * The real implementation of `CheckoutSagaPorts` — translates each raw
 * gRPC client's proto-shaped request/response into the orchestrator's
 * narrow port interfaces.
 * `demo/fake-checkout-ports.ts` is the test-only counterpart; the
 * orchestrator itself never imports this file or any `@temp-nx/contracts`
 * gRPC type — only `checkout-saga-ports.ts`'s plain interfaces.
 */
export function createGrpcCheckoutPorts(config: GrpcCheckoutPortsConfig): CheckoutSagaPorts {
  const inventoryClient = createInventoryGrpcClient({ url: config.inventoryUrl, getToken: config.getToken });
  const paymentClient = createPaymentGrpcClient({ url: config.paymentUrl, getToken: config.getToken });
  const marketingClient = createMarketingGrpcClient({ url: config.marketingUrl, getToken: config.getToken });

  return {
    discount: {
      async validateDiscount(input) {
        const response = await marketingClient.validateDiscount({
          storeId: input.storeId,
          code: input.code,
          customerId: input.customerId ?? undefined,
          subtotalMinor: input.subtotalMinor,
          currency: input.currency,
        });
        if (response.valid) {
          return { valid: true, discountId: response.valid.discountId, discountMinor: response.valid.discountMinor };
        }
        return { valid: false, reason: DiscountValidationFailureReason[response.failure.reason] };
      },
    },
    inventory: {
      async reserveStock(input) {
        const response = await inventoryClient.reserveStock(input);
        if (response.reserved) {
          return { reserved: true, reservationId: response.reserved.reservationId };
        }
        return { reserved: false, reason: ReservationFailureReason[response.failure.reason] };
      },
      async releaseReservation(input) {
        await inventoryClient.releaseReservation(input);
      },
    },
    payment: {
      async createPaymentIntent(input) {
        const response = await paymentClient.createPaymentIntent({ ...input, metadata: {} });
        if (response.created) {
          return { created: true, paymentId: response.created.paymentId, clientSecret: response.created.clientSecret };
        }
        return { created: false, reason: PaymentIntentFailureReason[response.failure.reason] };
      },
      async cancelPaymentIntent(input) {
        await paymentClient.cancelPaymentIntent(input);
      },
    },
  };
}
