/**
 * Standalone end-to-end smoke test — same shape as
 * `reservation-grpc-demo.ts`: proves the authenticated gRPC
 * path works end-to-end against live containers.
 *
 *   docker compose up -d postgres identity-service payment-service pulsar
 *   DEMO_GRPC_CLIENT_SECRET=<secret> npm run payment:grpc-demo
 *
 * (the `demo-grpc-client` service account must exist with
 * `payments:create_intent`/`payments:cancel_intent` scopes — see
 * `identity:service-accounts:seed`.)
 */
import { status } from '@grpc/grpc-js';
import {
  createPaymentGrpcClient,
  PaymentGrpcError,
  PaymentIntentFailureReason,
} from '../index';

async function fetchInternalToken(params: {
  identityUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}): Promise<string> {
  const response = await fetch(`${params.identityUrl}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: params.clientId,
      client_secret: params.clientSecret,
      scope: params.scope,
    }),
  });
  if (!response.ok) {
    throw new Error(`token request failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function main() {
  const identityUrl = process.env['IDENTITY_URL'] ?? 'http://localhost:3001/api';
  const grpcUrl = process.env['PAYMENT_GRPC_URL'] ?? `localhost:${process.env['PAYMENT_GRPC_PORT'] ?? 50053}`;
  const clientId = process.env['DEMO_GRPC_CLIENT_ID'] ?? 'demo-grpc-client';
  const clientSecret = process.env['DEMO_GRPC_CLIENT_SECRET'];
  if (!clientSecret) {
    throw new Error(
      'DEMO_GRPC_CLIENT_SECRET is required — this is the secret printed once by ' +
        '`npm run identity:service-accounts:seed` for client_id=demo-grpc-client. ' +
        'Re-run that seed script with DEMO_GRPC_CLIENT_SECRET=<value> set to pin/see it again.',
    );
  }

  console.log(`[demo] fetching internal token from ${identityUrl}/auth/token`);
  const token = await fetchInternalToken({
    identityUrl,
    clientId,
    clientSecret,
    scope: 'payments:create_intent payments:cancel_intent',
  });
  console.log('[demo] got token');

  console.log(`[demo] connecting to payment-service gRPC at ${grpcUrl}`);
  const client = createPaymentGrpcClient({ url: grpcUrl, getToken: () => token });

  try {
    // 1) Authenticated call, a valid amount -> expect a typed success.
    const storeId = `demo-store-${Date.now()}`;
    const createResponse = await client.createPaymentIntent({
      storeId,
      orderId: `demo-order-${Date.now()}`,
      amountMinor: 1500,
      currency: 'USD',
      idempotencyKey: `demo-idem-${Date.now()}`,
      metadata: {},
    });
    if (!createResponse.created) {
      throw new Error(`expected a created intent, got: ${JSON.stringify(createResponse)}`);
    }
    console.log(`[demo] OK — CreatePaymentIntent succeeded, paymentId=${createResponse.created.paymentId}`);

    // 2) Same call again, invalid amount -> expect a typed INVALID_AMOUNT failure.
    const invalidResponse = await client.createPaymentIntent({
      storeId,
      orderId: `demo-order-${Date.now()}`,
      amountMinor: 0,
      currency: 'USD',
      idempotencyKey: `demo-idem-invalid-${Date.now()}`,
      metadata: {},
    });
    if (invalidResponse.failure?.reason !== PaymentIntentFailureReason.INVALID_AMOUNT) {
      throw new Error(`expected INVALID_AMOUNT failure, got: ${JSON.stringify(invalidResponse)}`);
    }
    console.log('[demo] OK — CreatePaymentIntent with amountMinor=0 returned typed INVALID_AMOUNT failure');

    // 3) Cancel the first intent -> expect success, alreadyCanceled: false.
    const cancelResponse = await client.cancelPaymentIntent({
      storeId,
      paymentId: createResponse.created.paymentId,
    });
    if (!cancelResponse.canceled || cancelResponse.canceled.alreadyCanceled) {
      throw new Error(`expected a fresh cancel, got: ${JSON.stringify(cancelResponse)}`);
    }
    console.log('[demo] OK — CancelPaymentIntent succeeded');

    // 4) Cancel it again -> idempotent no-op, alreadyCanceled: true.
    const cancelAgainResponse = await client.cancelPaymentIntent({
      storeId,
      paymentId: createResponse.created.paymentId,
    });
    if (!cancelAgainResponse.canceled?.alreadyCanceled) {
      throw new Error(`expected an idempotent already-canceled response, got: ${JSON.stringify(cancelAgainResponse)}`);
    }
    console.log('[demo] OK — repeated CancelPaymentIntent was an idempotent no-op');

    // 5) Cancel a nonexistent payment -> expect a real gRPC NOT_FOUND error.
    try {
      await client.cancelPaymentIntent({ storeId, paymentId: 'demo-nonexistent-payment' });
      throw new Error('expected cancel of an unknown payment to reject with NOT_FOUND, but it resolved');
    } catch (err) {
      if (!(err instanceof PaymentGrpcError) || err.code !== status.NOT_FOUND) {
        throw err;
      }
      console.log('[demo] OK — CancelPaymentIntent on unknown payment rejected with NOT_FOUND');
    }

    // 6) No token -> expect UNAUTHENTICATED.
    const unauthClient = createPaymentGrpcClient({ url: grpcUrl, getToken: () => '' });
    try {
      await unauthClient.createPaymentIntent({
        storeId,
        orderId: 'demo-order',
        amountMinor: 1500,
        currency: 'USD',
        idempotencyKey: `demo-unauth-${Date.now()}`,
        metadata: {},
      });
      throw new Error('expected an empty-token call to reject with UNAUTHENTICATED, but it resolved');
    } catch (err) {
      if (!(err instanceof PaymentGrpcError) || !err.isUnauthenticated) {
        throw err;
      }
      console.log('[demo] OK — call with no valid token rejected with UNAUTHENTICATED');
    } finally {
      unauthClient.close();
    }

    console.log('[demo] ALL OK — authenticated payment gRPC round trip proven.');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('[demo] FAILED:', err);
  process.exit(1);
});
