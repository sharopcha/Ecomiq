/**
 * Standalone end-to-end smoke test — proves the authenticated gRPC path
 * works: identity-service issues a
 * client-credentials token, inventory-service's `ReservationService` accepts
 * a call bearing that token and rejects one without it. Not part of any
 * service; run by hand against live containers:
 *
 *   docker compose up -d postgres identity-service inventory-service
 *   DEMO_GRPC_CLIENT_SECRET=<secret set when seeding> npm run inventory:grpc-demo
 *
 * (the `demo-grpc-client` service account must already exist — see
 * `identity:service-accounts:seed`, which prints this secret once on first
 * create; pin it via that same env var if you need a stable value.)
 *
 * Deliberately does NOT assume any seeded catalog/inventory stock data
 * exists — it calls ReserveStock with a variantId that (almost certainly)
 * doesn't exist and asserts the typed `VARIANT_NOT_FOUND` failure comes
 * back, which proves the full round trip (auth -> scope check ->
 * StockLevelsService lookup -> typed response) without needing real stock
 * fixtures. Same idea for ReleaseReservation against a bogus reservationId
 * (asserts a NOT_FOUND gRPC error). Exits non-zero on any unexpected
 * outcome, so it's usable as a CI smoke test later, not just a manual check.
 */
import { status } from '@grpc/grpc-js';
import {
  createInventoryGrpcClient,
  InventoryGrpcError,
  ReservationFailureReason,
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
  const grpcUrl = process.env['INVENTORY_GRPC_URL'] ?? `localhost:${process.env['INVENTORY_GRPC_PORT'] ?? 50051}`;
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
    scope: 'inventory:reserve inventory:release',
  });
  console.log('[demo] got token');

  console.log(`[demo] connecting to inventory-service gRPC at ${grpcUrl}`);
  const client = createInventoryGrpcClient({ url: grpcUrl, getToken: () => token });

  try {
    // 1) Authenticated call, nonexistent variant -> expect a typed
    //    VARIANT_NOT_FOUND failure (not a thrown gRPC error).
    const reserveResponse = await client.reserveStock({
      storeId: 'demo-store',
      variantId: 'demo-nonexistent-variant',
      locationId: '',
      qty: 1,
      orderId: '',
      orderLineId: '',
      idempotencyKey: `demo-${Date.now()}`,
    });
    if (reserveResponse.failure?.reason !== ReservationFailureReason.VARIANT_NOT_FOUND) {
      throw new Error(`expected VARIANT_NOT_FOUND failure, got: ${JSON.stringify(reserveResponse)}`);
    }
    console.log('[demo] OK — ReserveStock on unknown variant returned typed VARIANT_NOT_FOUND failure');

    // 2) Authenticated call, bogus reservationId -> expect a real gRPC
    //    NOT_FOUND error (this is the "genuinely missing" path, not a typed
    //    business-rule failure — see reservation-grpc.controller.ts's doc
    //    comment for why that distinction exists).
    try {
      await client.releaseReservation({
        storeId: 'demo-store',
        reservationId: 'demo-nonexistent-reservation',
        idempotencyKey: `demo-${Date.now()}`,
      });
      throw new Error('expected ReleaseReservation on a bogus id to reject with NOT_FOUND, but it resolved');
    } catch (err) {
      if (!(err instanceof InventoryGrpcError) || err.code !== status.NOT_FOUND) {
        throw err;
      }
      console.log('[demo] OK — ReleaseReservation on unknown reservation rejected with NOT_FOUND');
    }

    // 3) No token -> expect UNAUTHENTICATED.
    const unauthClient = createInventoryGrpcClient({ url: grpcUrl, getToken: () => '' });
    try {
      await unauthClient.reserveStock({
        storeId: 'demo-store',
        variantId: 'demo-nonexistent-variant',
        locationId: '',
        qty: 1,
        orderId: '',
        orderLineId: '',
        idempotencyKey: `demo-${Date.now()}`,
      });
      throw new Error('expected an empty-token call to reject with UNAUTHENTICATED, but it resolved');
    } catch (err) {
      if (!(err instanceof InventoryGrpcError) || !err.isUnauthenticated) {
        throw err;
      }
      console.log('[demo] OK — call with no valid token rejected with UNAUTHENTICATED');
    } finally {
      unauthClient.close();
    }

    console.log('[demo] ALL OK — authenticated gRPC round trip proven.');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('[demo] FAILED:', err);
  process.exit(1);
});
