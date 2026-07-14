/**
 * Contract test for the checked-in ts-proto output — same reasoning as
 * `reservation-contract.spec.ts`: mostly a
 * compile-time check (this file only typechecks if the generated
 * interfaces still match what `payment-grpc.controller.ts`/the client
 * factory are coded against), plus a real wire round-trip to catch field
 * numbering drift and confirm the `oneof` success/failure split stays
 * mutually exclusive.
 */
import {
  CancelPaymentIntentRequest,
  CancelPaymentIntentResponse,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  PaymentIntentFailureReason,
} from './generated/payment/v1/payment_intent';

describe('PaymentIntentService generated contract', () => {
  it('round-trips a CreatePaymentIntentRequest with metadata', () => {
    const original: CreatePaymentIntentRequest = {
      storeId: 'store_1',
      orderId: 'order_1',
      amountMinor: 1500,
      currency: 'USD',
      idempotencyKey: 'idem_1',
      metadata: { simulate: 'fail' },
    };
    const decoded = CreatePaymentIntentRequest.decode(
      CreatePaymentIntentRequest.encode(original).finish(),
    );
    expect(decoded).toEqual(original);
  });

  it('round-trips a successful CreatePaymentIntentResponse', () => {
    const original: CreatePaymentIntentResponse = {
      created: {
        paymentId: 'payment_1',
        externalRef: 'mock_pi_1',
        clientSecret: 'mock_secret_1',
        status: 'requires_confirmation',
      },
    };
    const decoded = CreatePaymentIntentResponse.decode(
      CreatePaymentIntentResponse.encode(original).finish(),
    );
    expect(decoded.created).toEqual(original.created);
    expect(decoded.failure).toBeUndefined();
  });

  it('round-trips a typed failure via the oneof, not a thrown error', () => {
    const original: CreatePaymentIntentResponse = {
      failure: {
        reason: PaymentIntentFailureReason.DUPLICATE_IDEMPOTENCY_KEY_CONFLICT,
        message: 'idempotency key already used by a different store',
      },
    };
    const decoded = CreatePaymentIntentResponse.decode(
      CreatePaymentIntentResponse.encode(original).finish(),
    );
    expect(decoded.failure).toEqual(original.failure);
    expect(decoded.created).toBeUndefined();
  });

  it('round-trips CancelPaymentIntent request/response, including alreadyCanceled', () => {
    const req: CancelPaymentIntentRequest = {
      storeId: 'store_1',
      paymentId: 'payment_1',
    };
    const decodedReq = CancelPaymentIntentRequest.decode(
      CancelPaymentIntentRequest.encode(req).finish(),
    );
    expect(decodedReq).toEqual(req);

    const res: CancelPaymentIntentResponse = {
      canceled: { paymentId: 'payment_1', alreadyCanceled: true },
    };
    const decodedRes = CancelPaymentIntentResponse.decode(
      CancelPaymentIntentResponse.encode(res).finish(),
    );
    expect(decodedRes.canceled).toEqual(res.canceled);
  });
});
