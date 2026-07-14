/**
 * Migration-vs-synchronize schema diff for crm_db.
 *
 * Two throwaway databases against the *real* running `ecomiq-postgres`
 * container — one brought up by running the hand-written migration's
 * `up()`, the other by TypeORM `synchronize:true` against the same
 * entities — then a column-level `information_schema.columns` diff between
 * them. Clones shipping-service's `verify-migration.ts`, down()-loop fix
 * included from the start.
 *
 * Requires a reachable Postgres (the docker-compose `postgres` service, or
 * any Postgres matching CRM_DB_HOST/PORT/USER/PASSWORD) — this is a
 * real-infra check, not a mocked one. Creates/drops two throwaway databases
 * (`<CRM_DB_NAME>_verify_migrated`, `<CRM_DB_NAME>_verify_sync`); never
 * touches the real crm_db.
 *
 * Run:
 *   TS_NODE_PROJECT=apps/services/crm/tsconfig.app.json ts-node -r tsconfig-paths/register apps/services/crm/src/demo/verify-migration.ts
 */
import 'reflect-metadata';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import { OutboxMessage } from '@temp-nx/typeorm';
import { Customer } from '../app/entities/customer.entity';
import { CustomerAddress } from '../app/entities/customer-address.entity';
import { StoreSequence } from '../app/entities/store-sequence.entity';
import { ActivityLog } from '../app/entities/activity-log.entity';
import { ProcessedEvent } from '../app/entities/processed-event.entity';
import { ProductReview } from '../app/entities/product-review.entity';
import { ReviewRequest } from '../app/entities/review-request.entity';
import { Referral } from '../app/entities/referral.entity';
import { WishlistItem } from '../app/entities/wishlist-item.entity';
import { LoyaltyAccount } from '../app/entities/loyalty-account.entity';
import { LoyaltyTxn } from '../app/entities/loyalty-txn.entity';
import { Segment } from '../app/entities/segment.entity';
import { SegmentMember } from '../app/entities/segment-member.entity';

loadEnv();

const HOST = process.env.CRM_DB_HOST ?? 'localhost';
const PORT = Number(process.env.CRM_DB_PORT ?? 5432);
const USER = process.env.CRM_DB_USER ?? 'ecomiq';
const PASSWORD = process.env.CRM_DB_PASSWORD ?? 'ecomiq';
const BASE_DB = process.env.CRM_DB_NAME ?? 'crm_db';
const MIGRATED_DB = `${BASE_DB}_verify_migrated`;
const SYNC_DB = `${BASE_DB}_verify_sync`;

const ENTITIES = [
  OutboxMessage,
  Customer,
  CustomerAddress,
  StoreSequence,
  ActivityLog,
  ProcessedEvent,
  ProductReview,
  ReviewRequest,
  Referral,
  WishlistItem,
  LoyaltyAccount,
  LoyaltyTxn,
  Segment,
  SegmentMember,
];

async function withAdminClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  // Connects to the cluster's default maintenance-ish db (same user's own
  // db, "ecomiq" in this repo's convention) to issue CREATE/DROP DATABASE —
  // those can't run inside a DataSource's own transaction.
  const client = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: 'ecomiq' });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dropDbIfExists(client: Client, name: string) {
  await client.query(`DROP DATABASE IF EXISTS ${name}`);
}

async function dumpSchema(dbName: string): Promise<string[]> {
  // Column-level diff only (table.column:type:nullable:default) — deliberately
  // NOT diffing index *names*: TypeORM's `synchronize` auto-generates hashed
  // `IDX_...` names while this hand-written migration uses a descriptive one
  // (`outbox_processed_at_created_at_idx`, matching every other service's
  // convention) — comparing index name text would flag a cosmetic
  // difference as a mismatch, not a real one.
  const client = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: dbName });
  await client.connect();
  try {
    const cols = await client.query(
      `SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,'') AS line
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name NOT IN ('migrations')
       ORDER BY 1`,
    );
    return cols.rows.map((r) => r.line as string);
  } finally {
    await client.end();
  }
}

async function main() {
  await withAdminClient(async (admin) => {
    await dropDbIfExists(admin, MIGRATED_DB);
    await dropDbIfExists(admin, SYNC_DB);
    await admin.query(`CREATE DATABASE ${MIGRATED_DB}`);
    await admin.query(`CREATE DATABASE ${SYNC_DB}`);
  });

  console.log(`[verify-migration] running migration up() against ${MIGRATED_DB}...`);
  const migratedDs = new DataSource({
    type: 'postgres',
    host: HOST,
    port: PORT,
    username: USER,
    password: PASSWORD,
    database: MIGRATED_DB,
    entities: ENTITIES,
    migrations: [__dirname + '/../app/migrations/*.{ts,js}'],
    synchronize: false,
  });
  await migratedDs.initialize();
  await migratedDs.runMigrations();
  const migratedDump = await dumpSchema(MIGRATED_DB);

  console.log('[verify-migration] running down() for every migration and asserting empty...');
  // `undoLastMigration()` only reverts the single most recent migration —
  // with 2+ migration files, a single call leaves earlier ones' tables
  // behind. Loop until the migrations table itself is empty.
  let executedCount = (await migratedDs.query(`SELECT count(*)::int AS c FROM migrations`))[0].c;
  while (executedCount > 0) {
    await migratedDs.undoLastMigration();
    executedCount = (await migratedDs.query(`SELECT count(*)::int AS c FROM migrations`))[0].c;
  }
  const tablesAfterDown = await migratedDs.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name != 'migrations'`,
  );
  await migratedDs.destroy();
  if (tablesAfterDown.length > 0) {
    console.error('[verify-migration] FAIL: down() left tables behind:', tablesAfterDown);
    process.exitCode = 1;
  } else {
    console.log('[verify-migration] down() left the schema empty — OK.');
  }

  console.log(`[verify-migration] running synchronize:true against ${SYNC_DB}...`);
  const syncDs = new DataSource({
    type: 'postgres',
    host: HOST,
    port: PORT,
    username: USER,
    password: PASSWORD,
    database: SYNC_DB,
    entities: ENTITIES,
    synchronize: true,
  });
  await syncDs.initialize();
  const syncDump = await dumpSchema(SYNC_DB);
  await syncDs.destroy();

  await withAdminClient(async (admin) => {
    await dropDbIfExists(admin, MIGRATED_DB);
    await dropDbIfExists(admin, SYNC_DB);
  });

  const migratedSorted = [...migratedDump].sort();
  const syncSorted = [...syncDump].sort();
  const onlyInMigrated = migratedSorted.filter((l) => !syncSorted.includes(l));
  const onlyInSync = syncSorted.filter((l) => !migratedSorted.includes(l));

  if (onlyInMigrated.length === 0 && onlyInSync.length === 0) {
    console.log('MATCH');
  } else {
    console.error('[verify-migration] MISMATCH');
    console.error('Only in migration up():', onlyInMigrated);
    console.error('Only in synchronize:true:', onlyInSync);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[verify-migration] FAILED:', err);
  process.exitCode = 1;
});
