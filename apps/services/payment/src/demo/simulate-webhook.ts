/**
 * Builds a correctly HMAC-signed mock-provider webhook body for a given
 * `externalRef` and POSTs it over real HTTP to a running payment-service —
 * either directly, or through the gateway
 * (`--url=http://localhost:3000/api/payments`), which also proves the
 * narrow public sub-route (`payment-webhooks-proxy.controller.ts`)
 * actually forwards signed bytes unmangled.
 *
 * The deterministic-failure rule (`isDeterministicFailure`, defined
 * alongside `MockPaymentProvider`) decides whether this builds an
 * `intent.succeeded` or `intent.failed` event — pass `--amountMinor` to
 * match whatever amount the target intent was actually created with (an
 * amount ending in `99`, or `--simulateFail`, both fail deterministically).
 *
 * Usage:
 *   npm run payment:webhook-demo -- --externalRef=mock_pi_XXXX --amountMinor=1500
 *   npm run payment:webhook-demo -- --externalRef=mock_pi_XXXX --amountMinor=1099            # deterministic failure (ends in 99)
 *   npm run payment:webhook-demo -- --externalRef=mock_pi_XXXX --amountMinor=1500 --simulateFail
 *   npm run payment:webhook-demo -- --externalRef=mock_pi_XXXX --amountMinor=1500 --tamper    # expect 400, no inbox row
 *   npm run payment:webhook-demo -- --externalRef=mock_pi_XXXX --amountMinor=1500 --url=http://localhost:3000/api/payments
 */
import { ulid } from 'ulid';
import { isDeterministicFailure, MOCK_SIGNATURE_HEADER, signMockWebhookBody } from '../app/provider/mock-payment.provider';
import { ProviderWebhookEvent } from '../app/provider/payment-provider.port';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const externalRef = arg('externalRef');
  if (!externalRef) {
    throw new Error('--externalRef=<ref> is required (the Payment.externalRef to target)');
  }
  const amountMinor = Number(arg('amountMinor') ?? '1500');
  const simulateFail = flag('simulateFail');
  const tamper = flag('tamper');
  const baseUrl = (arg('url') ?? 'http://localhost:3005/api').replace(/\/$/, '');
  const secret = process.env.MOCK_WEBHOOK_SECRET ?? 'dev-mock-webhook-secret';

  const shouldFail = isDeterministicFailure(amountMinor, simulateFail ? { simulate: 'fail' } : undefined);
  const event: ProviderWebhookEvent = shouldFail
    ? {
        externalEventId: `evt_${ulid()}`,
        kind: 'intent.failed',
        externalRef,
        failureReason: 'mock provider: deterministic/simulated failure',
      }
    : {
        externalEventId: `evt_${ulid()}`,
        kind: 'intent.succeeded',
        externalRef,
        amountMinor,
      };

  const body = Buffer.from(JSON.stringify(event));
  const signature = tamper ? 'deadbeef'.repeat(8) : signMockWebhookBody(body, secret);

  const url = `${baseUrl}/webhooks/mock`;
  console.log(`[webhook-demo] POSTing ${event.kind} (externalEventId=${event.externalEventId}) for ${externalRef} to ${url}${tamper ? ' [TAMPERED SIGNATURE]' : ''} ...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [MOCK_SIGNATURE_HEADER]: signature },
    body,
  });
  const text = await res.text();
  console.log(`[webhook-demo] status=${res.status} body=${text}`);

  if (tamper && res.status !== 400) {
    throw new Error(`expected 400 for a tampered signature, got ${res.status}`);
  }
  if (!tamper && res.status !== 200) {
    throw new Error(`expected 200, got ${res.status}: ${text}`);
  }
}

main().catch((err) => {
  console.error('[webhook-demo] FAILED:', err);
  process.exit(1);
});
