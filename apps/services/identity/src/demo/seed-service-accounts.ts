/**
 * Seeds the service_account rows order-service (and gRPC clients
 * generally) will authenticate as via
 * POST /auth/token. No migrations for this table (identityDataSourceOptions
 * relies on `synchronize: true` in dev, same as every other identity
 * entity) — this script is the only "known good starting state."
 *
 * Boots identity-service's own Nest application context (no HTTP listener),
 * same pattern as catalog-service's demo/seed.ts.
 *
 * Idempotent by `client_id`:
 *   - doesn't exist yet -> created, secret generated (or taken from the
 *     matching env var below) and printed ONCE — it is never stored or
 *     shown again, only its bcrypt hash is persisted.
 *   - already exists, no matching env var set -> left alone, secret not
 *     re-shown (we don't have the plaintext).
 *   - already exists, matching env var set -> secret rotated to that value
 *     and printed (lets you pin a known secret for local dev/CI without
 *     committing it — export the env var yourself, never hard-code it here).
 *
 *   docker compose up -d postgres
 *   npm run identity:service-accounts:seed
 *   ORDER_SERVICE_CLIENT_SECRET=... npm run identity:service-accounts:seed   # pin/rotate
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../app/app.module';
import { ServiceAccount } from '../app/entities/service-account.entity';

const BCRYPT_ROUNDS = 12; // matches auth.service.ts's password hashing cost

interface AccountSpec {
  clientId: string;
  serviceName: string;
  allowedScopes: string[];
  /** Env var that can supply/rotate this account's secret; unset = auto-generate on first create. */
  secretEnvVar: string;
}

// order-service is the first real gRPC caller (ReserveStock/ReleaseReservation);
// the demo account exists so inventory:grpc-demo has something to
// authenticate as without touching order-service's own credentials.
const ACCOUNTS: AccountSpec[] = [
  {
    clientId: 'order-service',
    serviceName: 'order-service',
    // payments:create_intent/cancel_intent, marketing:validate_discount —
    // order-service's checkout saga is each of these gRPC services' other
    // caller.
    allowedScopes: [
      'inventory:reserve',
      'inventory:release',
      'payments:create_intent',
      'payments:cancel_intent',
      'marketing:validate_discount',
    ],
    secretEnvVar: 'ORDER_SERVICE_CLIENT_SECRET',
  },
  {
    clientId: 'demo-grpc-client',
    serviceName: 'inventory-grpc-demo',
    allowedScopes: [
      'inventory:reserve',
      'inventory:release',
      'payments:create_intent',
      'payments:cancel_intent',
      'marketing:validate_discount',
    ],
    secretEnvVar: 'DEMO_GRPC_CLIENT_SECRET',
  },
  {
    clientId: 'notification-service',
    serviceName: 'notification-service',
    // WebhookDispatchService's engagement forward is the only internal
    // caller notification-service has (notification-plan Step 8) — a
    // single narrow scope for marketing's engagement write-back endpoint.
    allowedScopes: ['marketing:record_send_event'],
    secretEnvVar: 'NOTIFICATION_SERVICE_CLIENT_SECRET',
  },
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repo: Repository<ServiceAccount> = app.get(
    getRepositoryToken(ServiceAccount),
  );

  for (const spec of ACCOUNTS) {
    const envSecret = process.env[spec.secretEnvVar];
    const existing = await repo.findOneBy({ clientId: spec.clientId });

    if (!existing) {
      const secret = envSecret ?? randomBytes(32).toString('hex');
      const secretHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
      await repo.save(
        repo.create({
          clientId: spec.clientId,
          secretHash,
          serviceName: spec.serviceName,
          allowedScopes: spec.allowedScopes,
          isActive: true,
        }),
      );
      console.log(`[created] client_id=${spec.clientId}`);
      console.log(`  client_secret=${secret}  (shown once — store it now)`);
      continue;
    }

    // Sync allowedScopes on every run, independent of secret rotation below
    // — otherwise a later addition to this file's ACCOUNTS array (e.g. new
    // payments:* scopes) would silently never reach an already-seeded row;
    // only re-running with the matching *_CLIENT_SECRET env var happened to
    // touch it before this fix.
    const scopesChanged =
      JSON.stringify([...existing.allowedScopes].sort()) !==
      JSON.stringify([...spec.allowedScopes].sort());
    if (scopesChanged) {
      existing.allowedScopes = spec.allowedScopes;
    }

    if (envSecret) {
      existing.secretHash = await bcrypt.hash(envSecret, BCRYPT_ROUNDS);
      await repo.save(existing);
      console.log(`[rotated] client_id=${spec.clientId}${scopesChanged ? ' (scopes updated)' : ''}`);
      console.log(`  client_secret=${envSecret}  (shown once — store it now)`);
      continue;
    }

    if (scopesChanged) {
      await repo.save(existing);
      console.log(`[updated] client_id=${spec.clientId} — allowedScopes synced to ${JSON.stringify(spec.allowedScopes)}`);
      continue;
    }

    console.log(
      `[exists]  client_id=${spec.clientId} (secret unchanged — set ${spec.secretEnvVar} to rotate)`,
    );
  }

  console.log('\nExample token request:');
  console.log(
    `  curl -X POST http://localhost:3001/api/auth/token -H 'Content-Type: application/json' -d '{"grant_type":"client_credentials","client_id":"order-service","client_secret":"<secret>","scope":"inventory:reserve"}'`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
