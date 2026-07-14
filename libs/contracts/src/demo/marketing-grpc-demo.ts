/**
 * Standalone end-to-end smoke test — same shape as
 * reservation-grpc-demo.ts/payment-grpc-demo.ts, but since
 * ValidateDiscount is read-only, this demo first creates real discount
 * state through the live REST API (registering a fresh demo user via the
 * gateway) before validating it over gRPC — there's no write path on the
 * gRPC contract itself to set that state up.
 *
 *   docker compose up -d postgres identity-service marketing-service api-gateway
 *   DEMO_GRPC_CLIENT_SECRET=<secret> npm run marketing:grpc-demo
 */
import { status } from '@grpc/grpc-js';
import { createMarketingGrpcClient, DiscountValidationFailureReason, MarketingGrpcError } from '../index';

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

async function registerDemoUser(gatewayUrl: string): Promise<{ accessToken: string; storeId: string }> {
  const email = `marketing-grpc-demo-${Date.now()}@ecomiq.dev`;
  const response = await fetch(`${gatewayUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: 'TestPass123!',
      fullName: 'Marketing gRPC Demo',
      storeName: `Demo Store ${Date.now()}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`register failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { accessToken: string; store: { id: string } };
  return { accessToken: body.accessToken, storeId: body.store.id };
}

async function createAndActivateDiscount(
  gatewayUrl: string,
  accessToken: string,
  dto: { code: string; kind: string; value: number; endsAt?: string },
): Promise<void> {
  const createResponse = await fetch(`${gatewayUrl}/marketing/discounts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!createResponse.ok) {
    throw new Error(`create discount failed: ${createResponse.status} ${await createResponse.text()}`);
  }
  const created = (await createResponse.json()) as { id: string };

  const activateResponse = await fetch(`${gatewayUrl}/marketing/discounts/${created.id}/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!activateResponse.ok) {
    throw new Error(`activate discount failed: ${activateResponse.status} ${await activateResponse.text()}`);
  }
}

async function main() {
  const identityUrl = process.env['IDENTITY_URL'] ?? 'http://localhost:3001/api';
  const gatewayUrl = process.env['GATEWAY_URL'] ?? 'http://localhost:3000/api';
  const grpcUrl = process.env['MARKETING_GRPC_URL'] ?? `localhost:${process.env['MARKETING_GRPC_PORT'] ?? 50052}`;
  const clientId = process.env['DEMO_GRPC_CLIENT_ID'] ?? 'demo-grpc-client';
  const clientSecret = process.env['DEMO_GRPC_CLIENT_SECRET'];
  if (!clientSecret) {
    throw new Error(
      'DEMO_GRPC_CLIENT_SECRET is required — the secret printed once by ' +
        '`npm run identity:service-accounts:seed` for client_id=demo-grpc-client.',
    );
  }

  console.log('[demo] registering a fresh demo user + store via the gateway...');
  const { accessToken, storeId } = await registerDemoUser(gatewayUrl);

  console.log('[demo] creating + activating a valid discount (WELCOME20, 20% off)...');
  await createAndActivateDiscount(gatewayUrl, accessToken, {
    code: 'WELCOME20',
    kind: 'percentage',
    value: 2000,
  });

  console.log('[demo] creating + activating an already-expired discount...');
  await createAndActivateDiscount(gatewayUrl, accessToken, {
    code: 'OLDCODE',
    kind: 'fixed_amount',
    value: 500,
    endsAt: '2020-01-01T00:00:00.000Z',
  });

  console.log(`[demo] fetching internal token from ${identityUrl}/auth/token`);
  const token = await fetchInternalToken({
    identityUrl,
    clientId,
    clientSecret,
    scope: 'marketing:validate_discount',
  });
  console.log('[demo] got token');

  console.log(`[demo] connecting to marketing-service gRPC at ${grpcUrl}`);
  const client = createMarketingGrpcClient({ url: grpcUrl, getToken: () => token });

  try {
    // 1) Valid, active discount -> typed success with the computed discountMinor.
    const validResponse = await client.validateDiscount({
      storeId,
      code: 'welcome20', // deliberately lowercase — normalization happens server-side
      subtotalMinor: 10000,
      currency: 'USD',
    });
    if (!validResponse.valid || validResponse.valid.discountMinor !== 2000) {
      throw new Error(`expected a valid 2000-minor discount, got: ${JSON.stringify(validResponse)}`);
    }
    console.log('[demo] OK — valid code returned discountMinor=2000 (20% of 10000).');

    // 2) Unknown code -> typed NOT_FOUND failure.
    const unknownResponse = await client.validateDiscount({
      storeId,
      code: 'DOES-NOT-EXIST',
      subtotalMinor: 10000,
      currency: 'USD',
    });
    if (unknownResponse.failure?.reason !== DiscountValidationFailureReason.NOT_FOUND) {
      throw new Error(`expected NOT_FOUND failure, got: ${JSON.stringify(unknownResponse)}`);
    }
    console.log('[demo] OK — unknown code returned typed NOT_FOUND failure.');

    // 3) Expired discount -> typed EXPIRED failure.
    const expiredResponse = await client.validateDiscount({
      storeId,
      code: 'OLDCODE',
      subtotalMinor: 10000,
      currency: 'USD',
    });
    if (expiredResponse.failure?.reason !== DiscountValidationFailureReason.EXPIRED) {
      throw new Error(`expected EXPIRED failure, got: ${JSON.stringify(expiredResponse)}`);
    }
    console.log('[demo] OK — expired code returned typed EXPIRED failure.');

    // 4) No token -> expect UNAUTHENTICATED.
    const unauthClient = createMarketingGrpcClient({ url: grpcUrl, getToken: () => '' });
    try {
      await unauthClient.validateDiscount({
        storeId,
        code: 'WELCOME20',
        subtotalMinor: 10000,
        currency: 'USD',
      });
      throw new Error('expected an empty-token call to reject with UNAUTHENTICATED, but it resolved');
    } catch (err) {
      if (!(err instanceof MarketingGrpcError) || !err.isUnauthenticated) {
        throw err;
      }
      console.log('[demo] OK — call with no valid token rejected with UNAUTHENTICATED.');
    } finally {
      unauthClient.close();
    }

    console.log('[demo] ALL OK — authenticated marketing gRPC round trip proven.');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('[demo] FAILED:', err);
  process.exit(1);
});
